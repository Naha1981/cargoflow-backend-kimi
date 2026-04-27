import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";
import { callKimi, parseKimiJson, SystemPrompts } from "../../src/lib/ai";

export const documentClassification = task({
  id: "document-classification",
  maxDuration: 120,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "ai-queue", concurrencyLimit: 10 },
  run: async (payload: { runId: string; tenantId: string; text: string }) => {
    return safeRun({ runId: payload.runId, tenantId: payload.tenantId, taskName: "document-classification" }, async () => {
      const { runId, tenantId, text } = payload;
      const log = logger.child({ runId, tenantId, task: "document-classification" });

      log.info("Document classification started");

      const { content } = await callKimi({
        systemPrompt: SystemPrompts.classification,
        userPrompt: `OCR-extracted text (first 4000 chars):\n${text.slice(0, 4000)}`,
        temperature: 0.1,
        maxTokens: 256,
      });

      const parsed = parseKimiJson(content);
      const docType = parsed.data?.docType || "unknown";
      const category = parsed.data?.category || "logistics";
      const confidence = parsed.confidence || 0.0;

      await query(
        `UPDATE workflow_runs
         SET metadata = jsonb_build_object('docType', $3, 'category', $4, 'classificationConfidence', $5),
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [runId, tenantId, docType, category, confidence]
      );

      await emitEvent({
        tenantId,
        eventType: EventTypes.DOCUMENT_CLASSIFIED,
        source: "document-classification",
        partitionKey: runId,
        payload: { runId, docType, category, confidence },
      });

      log.info({ docType, category, confidence }, "Document classified");
      return { docType, category, confidence };
    });
  },
});
