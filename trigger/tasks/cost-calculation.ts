import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";
import { callKimi, parseKimiJson, SystemPrompts } from "../../src/lib/ai";

export const costCalculation = task({
  id: "cost-calculation",
  maxDuration: 120,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "ai-queue", concurrencyLimit: 10 },
  run: async (payload: {
    shipmentId: string;
    tenantId: string;
    value: number;
    incoterm: string;
    origin?: string;
    destination?: string;
  }) => {
    return safeRun({ tenantId: payload.tenantId, taskName: "cost-calculation" }, async () => {
      const { shipmentId, tenantId, value, incoterm, origin, destination } = payload;
      const log = logger.child({ shipmentId, tenantId, task: "cost-calculation" });

      log.info("Cost calculation started");

      const { content } = await callKimi({
        systemPrompt: SystemPrompts.costCalculation,
        userPrompt: JSON.stringify({ value, incoterm, origin, destination }),
        temperature: 0.1,
        maxTokens: 512,
      });

      const parsed = parseKimiJson(content);
      const cost = parsed.data || {};

      await query(
        `INSERT INTO costs (
           tenant_id, shipment_id, freight, duty, vat, insurance, transport,
           total_cost, margin, low_margin_flag
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tenantId,
          shipmentId,
          cost.freight || 0,
          cost.duty || 0,
          cost.vat || 0,
          cost.insurance || 0,
          cost.transport || 0,
          cost.total_cost || 0,
          cost.margin || 0,
          cost.low_margin_flag || false,
        ]
      );

      await emitEvent({
        tenantId,
        eventType: EventTypes.COST_CALCULATED,
        source: "cost-calculation",
        partitionKey: shipmentId,
        payload: { shipmentId, totalCost: cost.total_cost, margin: cost.margin },
      });

      log.info({ totalCost: cost.total_cost, margin: cost.margin }, "Cost calculated");
      return { cost };
    });
  },
});
