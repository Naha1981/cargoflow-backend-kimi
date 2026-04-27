import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

export const trackingUpdate = task({
  id: "tracking-update",
  maxDuration: 60,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "tracking-queue", concurrencyLimit: 5 },
  run: async (payload: {
    shipmentId: string;
    tenantId: string;
    eta?: string;
    vesselStatus?: string;
  }) => {
    return safeRun({ tenantId: payload.tenantId, taskName: "tracking-update" }, async () => {
      const { shipmentId, tenantId, eta, vesselStatus } = payload;
      const log = logger.child({ shipmentId, tenantId, task: "tracking-update" });

      log.info("Tracking update started");

      const updates: string[] = [];
      const values: any[] = [tenantId, shipmentId];
      let idx = 3;

      if (eta) { updates.push(`eta = $${idx++}`); values.push(eta); }
      if (vesselStatus) { updates.push(`status = $${idx++}`); values.push(vesselStatus); }

      if (updates.length > 0) {
        const sql = `UPDATE shipments SET ${updates.join(", ")} WHERE tenant_id = $1 AND id = $2 RETURNING id, eta, status`;
        await query(sql, values);
      }

      await emitEvent({
        tenantId,
        eventType: EventTypes.TRACKING_UPDATED,
        source: "tracking-update",
        partitionKey: shipmentId,
        payload: { shipmentId, eta, vesselStatus },
      });

      log.info("Tracking update completed");
      return { shipmentId, eta, vesselStatus };
    });
  },
});
