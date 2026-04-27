import { task, tasks } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";
import { executiveSummary } from "./executive-summary";

export const summaryCron = task({
  id: "summary-cron",
  maxDuration: 600,
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 60000 },
  queue: { name: "ai-queue", concurrencyLimit: 10 },
  run: async () => {
    return safeRun({ taskName: "summary-cron" }, async () => {
      logger.info("Summary cron started");

      const tenants = await query<{ id: string }>(
        `SELECT DISTINCT tenant_id as id FROM shipments WHERE created_at > now() - interval '24 hours'`
      );

      for (const tenant of tenants) {
        const shipments = await query(
          `SELECT * FROM shipments WHERE tenant_id = $1 AND created_at > now() - interval '24 hours'`,
          [tenant.id]
        );

        const costs = await query(
          `SELECT * FROM costs WHERE tenant_id = $1 AND created_at > now() - interval '24 hours'`,
          [tenant.id]
        );

        const alerts = await query(
          `SELECT * FROM alerts WHERE tenant_id = $1 AND created_at > now() - interval '24 hours'`,
          [tenant.id]
        );

        // Create a synthetic runId for the summary task
        const runRows = await query<{ id: string }>(
          `INSERT INTO workflow_runs (tenant_id, workflow_type, status)
           VALUES ($1, 'daily_summary', 'processing') RETURNING id`,
          [tenant.id]
        );
        const runId = runRows[0].id;

        await tasks.triggerAndWait<typeof executiveSummary>("executive-summary", {
          tenantId: tenant.id,
          runId,
          context: { shipments, costs, alerts, period: "24h" },
        });
      }

      return { processedTenants: tenants.length };
    });
  },
});
