import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

export const shipmentCreate = task({
  id: "shipment-create",
  maxDuration: 60,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "db-queue", concurrencyLimit: 20 },
  run: async (payload: {
    tenantId: string;
    runId: string;
    filePath: string;
    extracted: Record<string, any>;
    docType: string;
  }) => {
    return safeRun({ runId: payload.runId, tenantId: payload.tenantId, taskName: "shipment-create" }, async () => {
      const { tenantId, runId, filePath, extracted, docType } = payload;
      const log = logger.child({ runId, tenantId, task: "shipment-create" });

      log.info("Shipment creation started");

      const rows = await query<{ id: string }>(
        `INSERT INTO shipments (
           tenant_id, shipment_code, supplier, origin, destination, status,
           value, currency, incoterm, commodity, vessel, carrier, etd, eta
         ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, COALESCE($7, 'USD'), $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          tenantId,
          extracted.shipment_code || null,
          extracted.supplier || null,
          extracted.origin || null,
          extracted.destination || null,
          extracted.value || null,
          extracted.currency || null,
          extracted.incoterm || null,
          extracted.commodity || null,
          extracted.vessel || null,
          extracted.carrier || null,
          extracted.etd || null,
          extracted.eta || null,
        ]
      );

      const shipmentId = rows[0].id;

      await query(
        `INSERT INTO documents (tenant_id, shipment_id, doc_type, file_path, extracted_json, status)
         VALUES ($1, $2, $3, $4, $5, 'processed')`,
        [tenantId, shipmentId, docType, filePath, JSON.stringify(extracted)]
      );

      await emitEvent({
        tenantId,
        eventType: EventTypes.SHIPMENT_CREATED,
        source: "shipment-create",
        partitionKey: shipmentId,
        payload: { runId, shipmentId, docType },
      });

      log.info({ shipmentId }, "Shipment created");
      return { shipmentId };
    });
  },
});
