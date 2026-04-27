import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

export const missingDocs = task({
  id: "missing-docs",
  maxDuration: 60,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "alerts-queue", concurrencyLimit: 10 },
  run: async (payload: {
    shipmentId: string;
    tenantId: string;
    missingDocuments: string[];
  }) => {
    return safeRun({ tenantId: payload.tenantId, taskName: "missing-docs" }, async () => {
      const { shipmentId, tenantId, missingDocuments } = payload;
      const log = logger.child({ shipmentId, tenantId, task: "missing-docs" });

      log.info("Missing docs check started");

      let created = 0;
      for (const docType of missingDocuments) {
        await query(
          `INSERT INTO alerts (tenant_id, shipment_id, severity, message)
           VALUES ($1, $2, 'medium', $3)`,
          [tenantId, shipmentId, `Missing required document: ${docType}`]
        );
        created++;
      }

      await emitEvent({
        tenantId,
        eventType: EventTypes.MISSING_DOCS_ALERT,
        source: "missing-docs",
        partitionKey: shipmentId,
        payload: { shipmentId, missingDocuments, alertsCreated: created },
      });

      log.info({ created }, "Missing docs alerts created");
      return { alertsCreated: created };
    });
  },
});
