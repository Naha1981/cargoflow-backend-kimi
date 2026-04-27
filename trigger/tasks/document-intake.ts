import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

export const documentIntake = task({
  id: "document-intake",
  maxDuration: 60,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 10000 },
  queue: { name: "db-queue", concurrencyLimit: 20 },
  run: async (payload: { tenantId: string; filePath: string; idempotencyKey: string }) => {
    return safeRun({ tenantId: payload.tenantId, taskName: "document-intake" }, async () => {
      const { tenantId, filePath, idempotencyKey } = payload;
      const log = logger.child({ tenantId, idempotencyKey, task: "document-intake" });

      log.info("Document intake started");

      const rows = await query<{ id: string; status: string }>(
        `INSERT INTO workflow_runs (tenant_id, idempotency_key, workflow_type, status, file_path)
         VALUES ($1, $2, 'document_pipeline', 'started', $3)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id, status`,
        [tenantId, idempotencyKey, filePath]
      );

      if (rows.length === 0) {
        const existing = await query<{ id: string }>(
          `SELECT id FROM workflow_runs WHERE idempotency_key = $1 AND tenant_id = $2`,
          [idempotencyKey, tenantId]
        );
        const runId = existing[0].id;
        log.info({ runId }, "Duplicate idempotency key; returning existing run");
        return { runId, tenantId, filePath, duplicate: true };
      }

      const runId = rows[0].id;
      log.info({ runId }, "Workflow run created");

      await emitEvent({
        tenantId,
        eventType: EventTypes.DOCUMENT_INTAKE_STARTED,
        source: "document-intake",
        partitionKey: runId,
        payload: { runId, filePath, idempotencyKey },
      });

      return { runId, tenantId, filePath, duplicate: false };
    });
  },
});
