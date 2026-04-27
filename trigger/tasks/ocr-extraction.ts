import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";
import { runOcr } from "../../src/lib/ocr";

export const ocrExtraction = task({
  id: "ocr-extraction",
  maxDuration: 300,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "ocr-queue", concurrencyLimit: 5 },
  run: async (payload: { runId: string; tenantId: string; filePath: string }) => {
    return safeRun({ runId: payload.runId, tenantId: payload.tenantId, taskName: "ocr-extraction" }, async () => {
      const { runId, tenantId, filePath } = payload;
      const log = logger.child({ runId, tenantId, task: "ocr-extraction" });

      log.info("OCR extraction started");

      const { text, pageCount } = await runOcr(filePath);

      await query(
        `UPDATE workflow_runs
         SET status = 'processing',
             extracted_data = jsonb_build_object('text', $3::text, 'pages', $4),
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [runId, tenantId, text, pageCount]
      );

      await emitEvent({
        tenantId,
        eventType: EventTypes.OCR_COMPLETED,
        source: "ocr-extraction",
        partitionKey: runId,
        payload: { runId, pageCount, textLength: text.length },
      });

      log.info({ pageCount, textLength: text.length }, "OCR extraction completed");
      return { text, pageCount };
    });
  },
});
