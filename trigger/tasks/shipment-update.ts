import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

export const shipmentUpdate = task({
  id: "shipment-update",
  maxDuration: 60,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "db-queue", concurrencyLimit: 20 },
  run: async (payload: {
    shipmentId: string;
    tenantId: string;
    data: Record<string, any>;
  }) => {
    return safeRun({ tenantId: payload.tenantId, taskName: "shipment-update" }, async () => {
      const { shipmentId, tenantId, data } = payload;
      const log = logger.child({ shipmentId, tenantId, task: "shipment-update" });

      log.info("Shipment update started");

      const updates: string[] = ["status = 'active'"];
      const values: any[] = [tenantId, shipmentId];
      let idx = 3;

      if (data.eta) { updates.push(`eta = $${idx++}`); values.push(data.eta); }
      if (data.vessel) { updates.push(`vessel = $${idx++}`); values.push(data.vessel); }
      if (data.carrier) { updates.push(`carrier = $${idx++}`); values.push(data.carrier); }
      if (data.etd) { updates.push(`etd = $${idx++}`); values.push(data.etd); }
      if (data.origin) { updates.push(`origin = $${idx++}`); values.push(data.origin); }
      if (data.destination) { updates.push(`destination = $${idx++}`); values.push(data.destination); }

      const sql = `UPDATE shipments SET ${updates.join(", ")} WHERE tenant_id = $1 AND id = $2 RETURNING *`;
      const rows = await query(sql, values);

      await emitEvent({
        tenantId,
        eventType: EventTypes.SHIPMENT_UPDATED,
        source: "shipment-update",
        partitionKey: shipmentId,
        payload: { shipmentId, updatedFields: Object.keys(data) },
      });

      log.info({ shipmentId }, "Shipment updated");
      return rows[0];
    });
  },
});
