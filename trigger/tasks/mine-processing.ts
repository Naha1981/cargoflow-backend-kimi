import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

export const mineProcessing = task({
  id: "mine-processing",
  maxDuration: 120,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "db-queue", concurrencyLimit: 20 },
  run: async (payload: {
    tenantId: string;
    runId: string;
    extracted: Record<string, any>;
  }) => {
    return safeRun({ runId: payload.runId, tenantId: payload.tenantId, taskName: "mine-processing" }, async () => {
      const { tenantId, runId, extracted } = payload;
      const log = logger.child({ runId, tenantId, task: "mine-processing" });

      log.info("Mine processing started");

      const permitExpiry = extracted.permit_expiry ? new Date(extracted.permit_expiry) : null;
      const now = new Date();
      const expired = permitExpiry ? permitExpiry < now : false;
      const envFlag = extracted.environmental_flag === true || extracted.environmental_flag === "true";

      const rows = await query<{ id: string }>(
        `INSERT INTO mine_projects (
           tenant_id, project_name, permit_number, status, location, commodity, contractor, permit_expiry, environmental_flag
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (permit_number) DO UPDATE SET
           project_name = EXCLUDED.project_name,
           status = EXCLUDED.status,
           location = EXCLUDED.location,
           commodity = EXCLUDED.commodity,
           contractor = EXCLUDED.contractor,
           permit_expiry = EXCLUDED.permit_expiry,
           environmental_flag = EXCLUDED.environmental_flag
         RETURNING id`,
        [
          tenantId,
          extracted.project_name || null,
          extracted.permit_number || null,
          expired ? "permit_expired" : extracted.status || "active",
          extracted.location || null,
          extracted.commodity || null,
          extracted.contractor || null,
          extracted.permit_expiry || null,
          envFlag,
        ]
      );

      const mineProjectId = rows[0]?.id;

      if (expired || envFlag) {
        await query(
          `INSERT INTO alerts (tenant_id, severity, message)
           VALUES ($1, 'high', $2)`,
          [tenantId, `Mine project ${extracted.project_name || extracted.permit_number} flagged: ${expired ? "permit expired" : ""}${expired && envFlag ? ", " : ""}${envFlag ? "environmental concern" : ""}`]
        );
      }

      await emitEvent({
        tenantId,
        eventType: EventTypes.WORKFLOW_COMPLETED,
        source: "mine-processing",
        partitionKey: runId,
        payload: { runId, mineProjectId, expired, envFlag },
      });

      log.info({ mineProjectId }, "Mine processing completed");
      return { mineProjectId, expired, envFlag };
    });
  },
});
