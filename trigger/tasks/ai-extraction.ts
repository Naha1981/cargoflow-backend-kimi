import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";
import { callKimi, parseKimiJson, SystemPrompts } from "../../src/lib/ai";

export const aiExtraction = task({
  id: "ai-extraction",
  maxDuration: 300,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "ai-queue", concurrencyLimit: 10 },
  run: async (payload: { runId: string; tenantId: string; text: string; docType: string }) => {
    return safeRun({ runId: payload.runId, tenantId: payload.tenantId, taskName: "ai-extraction" }, async () => {
      const { runId, tenantId, text, docType } = payload;
      const log = logger.child({ runId, tenantId, task: "ai-extraction", docType });

      log.info("AI extraction started");

      let systemPrompt = SystemPrompts.extractionLogistics;
      if (docType === "Mine Permit" || docType === "Environmental Report" || docType === "Contractor Agreement" || docType === "Equipment Log" || docType === "Blast Plan") {
        systemPrompt = SystemPrompts.extractionMining;
      } else if (
        docType === "Oil Bill of Lading" ||
        docType === "Oil Cargo Manifest" ||
        docType === "Quality Certificate" ||
        docType === "Certificate of Analysis" ||
        docType === "Loading Report" ||
        docType === "Discharge Report"
      ) {
        systemPrompt = SystemPrompts.extractionOil;
      }

      const { content } = await callKimi({
        systemPrompt,
        userPrompt: `Document type: ${docType}\nOCR text (first 6000 chars):\n${text.slice(0, 6000)}`,
        temperature: 0.1,
        maxTokens: 2000,
      });

      const parsed = parseKimiJson(content);
      const extracted = parsed.data || {};
      const confidence = parsed.confidence || 0.0;

      const needsReview = confidence < 0.5;

      await query(
        `UPDATE workflow_runs
         SET extracted_data = COALESCE(extracted_data, '{}'::jsonb) || $3::jsonb,
             confidence = $4,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [runId, tenantId, JSON.stringify({ extracted, needsReview }), confidence]
      );

      await emitEvent({
        tenantId,
        eventType: EventTypes.AI_EXTRACTION_COMPLETE,
        source: "ai-extraction",
        partitionKey: runId,
        payload: { runId, docType, confidence, needsReview },
      });

      log.info({ confidence, needsReview }, "AI extraction completed");
      return { extracted, confidence, needsReview };
    });
  },
});
