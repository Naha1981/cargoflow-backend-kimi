import express, { Request, Response } from "express";
import { config } from "dotenv";
import { authRouter } from "./auth";
import { authMiddleware, metricsApiKeyMiddleware, AuthenticatedRequest } from "./middleware";
import { securityHeaders } from "./security";
import { approvalsRouter } from "./approvals";
import { shipmentsRouter } from "./shipments";
import { alertsRouter } from "./alerts";
import { documentsRouter } from "./documents";
import { query } from "../lib/db";
import { logger } from "../lib/logger";
import { Sentry } from "../lib/sentry";

config();

const app = express();
const PORT = process.env.API_PORT || 3000;

app.use(securityHeaders);
app.use(express.json({ limit: "50mb" }));
app.use(Sentry.Handlers.requestHandler());

// Health check (no auth)
app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    await query("SELECT 1");
    return res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
  } catch {
    return res.status(503).json({ status: "degraded", database: "disconnected", timestamp: new Date().toISOString() });
  }
});

// Auth routes (no auth required)
app.use("/api/auth", authRouter);

// Metrics (API key auth, not JWT)
app.get("/api/metrics", metricsApiKeyMiddleware, async (_req: Request, res: Response) => {
  try {
    const shipmentsTotal = await query<{ count: string }>(`SELECT COUNT(*) FROM shipments`);
    const alertsUnread = await query<{ count: string }>(`SELECT COUNT(*) FROM alerts WHERE read = false`);
    const failed24h = await query<{ count: string }>(`SELECT COUNT(*) FROM workflow_runs WHERE status = 'failed' AND updated_at > now() - interval '24 hours'`);
    const success24h = await query<{ count: string }>(`SELECT COUNT(*) FROM workflow_runs WHERE status = 'completed' AND updated_at > now() - interval '24 hours'`);

    const output = [
      `# CargoFlow Metrics`,
      `shipments_total ${shipmentsTotal[0]?.count || 0}`,
      `alerts_unread_total ${alertsUnread[0]?.count || 0}`,
      `workflow_runs_failed_24h ${failed24h[0]?.count || 0}`,
      `workflow_runs_success_24h ${success24h[0]?.count || 0}`,
    ].join("\n");

    res.setHeader("Content-Type", "text/plain");
    return res.send(output);
  } catch (err) {
    logger.error({ err }, "Metrics endpoint failed");
    return res.status(500).send("# error generating metrics");
  }
});

// Protected routes
app.use("/api/approvals", approvalsRouter);
app.use("/api/shipments", shipmentsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/documents", documentsRouter);

app.get("/api/me", authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ user: req.user });
});

app.use(Sentry.Handlers.errorHandler());

app.listen(PORT, () => {
  logger.info(`API server listening on port ${PORT}`);
});

export default app;
