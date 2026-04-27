import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

export const marginAnalysis = task({
  id: "margin-analysis",
  maxDuration: 60,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "alerts-queue", concurrencyLimit: 10 },
  run: async (payload: {
    shipmentId: string;
    tenantId: string;
    marginPercentage: number;
    lowMarginFlag: boolean;
  }) => {
    return safeRun({ tenantId: payload.tenantId, taskName: "margin-analysis" }, async () => {
      const { shipmentId, tenantId, marginPercentage, lowMarginFlag } = payload;
      const log = logger.child({ shipmentId, tenantId, task: "margin-analysis" });

      log.info("Margin analysis started");

      if (lowMarginFlag) {
        await query(
          `INSERT INTO alerts (tenant_id, shipment_id, severity, message)
           VALUES ($1, $2, 'high', $3)`,
          [tenantId, shipmentId, `Low margin detected: ${marginPercentage}% on shipment`]
        );

        await emitEvent({
          tenantId,
          eventType: EventTypes.LOW_MARGIN_DETECTED,
          source: "margin-analysis",
          partitionKey: shipmentId,
          payload: { shipmentId, marginPercentage },
        });

        log.info({ marginPercentage }, "Low margin alert created");
      }

      return { marginPercentage, lowMarginFlag, alertCreated: lowMarginFlag };
    });
  },
});
