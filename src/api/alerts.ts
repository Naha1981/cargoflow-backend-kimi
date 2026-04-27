import { Router } from "express";
import { query, tenantQuery } from "../lib/db";
import { authMiddleware, AuthenticatedRequest } from "./middleware";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/alerts
 * List alerts for the tenant. Supports filtering by read status and severity.
 */
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { read, severity, limit = "50", offset = "0" } = req.query;

    let sql = `SELECT * FROM alerts WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (read !== undefined) { sql += ` AND read = $${idx++}`; params.push(read === "true"); }
    if (severity) { sql += ` AND severity = $${idx++}`; params.push(severity); }

    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const rows = await query(sql, params);
    return res.json({ alerts: rows });
  } catch (err) {
    logger.error({ err }, "Failed to list alerts");
    return res.status(500).json({ error: "Failed to list alerts" });
  }
});

/**
 * PATCH /api/alerts/:id
 * Mark an alert as read or escalate it.
 */
router.patch("/:id", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const alertId = req.params.id;
    const { read, escalated } = req.body;

    const sets: string[] = [];
    const params: any[] = [tenantId, alertId];
    let idx = 3;

    if (read !== undefined) { sets.push(`read = $${idx++}`); params.push(read); }
    if (escalated !== undefined) { sets.push(`escalated = $${idx++}`); params.push(escalated); }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const rows = await query(
      `UPDATE alerts SET ${sets.join(", ")} WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Alert not found" });
    }

    return res.json({ alert: rows[0] });
  } catch (err) {
    logger.error({ err }, "Failed to update alert");
    return res.status(500).json({ error: "Failed to update alert" });
  }
});

export { router as alertsRouter };
