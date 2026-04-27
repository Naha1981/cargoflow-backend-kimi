import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";
import { callKimi, parseKimiJson, SystemPrompts } from "../../src/lib/ai";

export const executiveSummary = task({
  id: "executive-summary",
  maxDuration: 300,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "ai-queue", concurrencyLimit: 10 },
  run: async (payload: {
    tenantId: string;
    runId: string;
    context: Record<string, any>;
  }) => {
    return safeRun({ runId: payload.runId, tenantId: payload.tenantId, taskName: "executive-summary" }, async () => {
      const { tenantId, runId, context } = payload;
      const log = logger.child({ runId, tenantId, task: "executive-summary" });

      log.info("Executive summary generation started");

      const { content } = await callKimi({
        systemPrompt: SystemPrompts.executiveSummary,
        userPrompt: JSON.stringify(context, null, 2),
        temperature: 0.3,
        maxTokens: 2000,
      });

      const parsed = parseKimiJson(content);
      const summary = parsed.data?.summary || "";
      const keyRisks = parsed.data?.keyRisks || [];
      const opportunities = parsed.data?.opportunities || [];
      const recommendations = parsed.data?.recommendations || [];
      const confidence = parsed.confidence || 0.0;

      const rows = await query<{ id: string }>(
        `INSERT INTO ai_insights (
           tenant_id, summary, risks, opportunities, recommendations
         ) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          tenantId,
          summary,
          JSON.stringify(keyRisks),
          JSON.stringify(opportunities),
          JSON.stringify(recommendations),
        ]
      );

      await query(
        `UPDATE workflow_runs SET status = 'completed', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [runId, tenantId]
      );

      await emitEvent({
        tenantId,
        eventType: EventTypes.EXECUTIVE_SUMMARY_GENERATED,
        source: "executive-summary",
        partitionKey: runId,
        payload: { runId, insightId: rows[0].id, confidence },
      });

      log.info({ insightId: rows[0].id }, "Executive summary generated");
      return { insightId: rows[0].id, summary, confidence };
    });
  },
});
