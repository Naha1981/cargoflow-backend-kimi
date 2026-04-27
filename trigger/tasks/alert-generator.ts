import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";
import { callKimi, parseKimiJson, SystemPrompts } from "../../src/lib/ai";

export const alertGenerator = task({
  id: "alert-generator",
  maxDuration: 120,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "alerts-queue", concurrencyLimit: 10 },
  run: async (payload: {
    shipmentId: string;
    tenantId: string;
    context: Record<string, any>;
  }) => {
    return safeRun({ tenantId: payload.tenantId, taskName: "alert-generator" }, async () => {
      const { shipmentId, tenantId, context } = payload;
      const log = logger.child({ shipmentId, tenantId, task: "alert-generator" });

      log.info("Alert generation started");

      const { content } = await callKimi({
        systemPrompt: SystemPrompts.riskDetection,
        userPrompt: JSON.stringify(context, null, 2),
        temperature: 0.2,
        maxTokens: 1500,
      });

      const parsed = parseKimiJson(content);
      const risks = parsed.data?.risks || [];
      const alertIds: string[] = [];

      for (const risk of risks) {
        const rows = await query<{ id: string }>(
          `INSERT INTO alerts (tenant_id, shipment_id, severity, message)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [tenantId, shipmentId, risk.severity || "medium", risk.message || "Risk detected"]
        );
        alertIds.push(rows[0].id);

        await emitEvent({
          tenantId,
          eventType: EventTypes.ALERT_CREATED,
          source: "alert-generator",
          partitionKey: shipmentId,
          payload: { shipmentId, alertId: rows[0].id, severity: risk.severity, message: risk.message },
        });
      }

      log.info({ alertsCreated: alertIds.length }, "Alert generation completed");
      return { alertIds, risks };
    });
  },
});
