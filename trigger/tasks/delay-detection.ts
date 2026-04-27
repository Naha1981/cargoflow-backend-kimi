import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

export const delayDetection = task({
  id: "delay-detection",
  maxDuration: 60,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "alerts-queue", concurrencyLimit: 10 },
  run: async (payload: {
    shipmentId: string;
    tenantId: string;
    etaOriginal?: string;
    etaCurrent?: string;
  }) => {
    return safeRun({ tenantId: payload.tenantId, taskName: "delay-detection" }, async () => {
      const { shipmentId, tenantId, etaOriginal, etaCurrent } = payload;
      const log = logger.child({ shipmentId, tenantId, task: "delay-detection" });

      log.info("Delay detection started");

      let delayed = false;
      let hoursLate = 0;

      if (etaOriginal && etaCurrent) {
        const original = new Date(etaOriginal).getTime();
        const current = new Date(etaCurrent).getTime();
        const diffMs = current - original;
        hoursLate = Math.round(diffMs / (1000 * 60 * 60));
        delayed = diffMs > 24 * 60 * 60 * 1000;
      }

      if (delayed) {
        await query(
          `INSERT INTO alerts (tenant_id, shipment_id, severity, message)
           VALUES ($1, $2, 'high', $3)`,
          [tenantId, shipmentId, `Shipment delayed by ${hoursLate} hours (ETA changed from ${etaOriginal} to ${etaCurrent})`]
        );

        await emitEvent({
          tenantId,
          eventType: EventTypes.DELAY_DETECTED,
          source: "delay-detection",
          partitionKey: shipmentId,
          payload: { shipmentId, hoursLate, etaOriginal, etaCurrent },
        });

        log.info({ hoursLate }, "Delay alert created");
      }

      return { delayed, hoursLate };
    });
  },
});
