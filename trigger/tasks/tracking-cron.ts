import { task, cronTrigger, tasks } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";
import { trackingUpdate } from "./tracking-update";
import { delayDetection } from "./delay-detection";

export const trackingCron = task({
  id: "tracking-cron",
  maxDuration: 300,
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 30000 },
  queue: { name: "tracking-queue", concurrencyLimit: 5 },
  run: async () => {
    return safeRun({ taskName: "tracking-cron" }, async () => {
      logger.info("Tracking cron started");

      const activeShipments = await query<{ id: string; tenant_id: string; eta: string; etd: string }>(
        `SELECT id, tenant_id, eta, etd FROM shipments WHERE status = 'active'`
      );

      logger.info({ count: activeShipments.length }, "Active shipments found");

      for (const shipment of activeShipments) {
        await tasks.triggerAndWait<typeof trackingUpdate>("tracking-update", {
          shipmentId: shipment.id,
          tenantId: shipment.tenant_id,
          eta: shipment.eta,
        });

        await tasks.triggerAndWait<typeof delayDetection>("delay-detection", {
          shipmentId: shipment.id,
          tenantId: shipment.tenant_id,
          etaOriginal: shipment.etd,
          etaCurrent: shipment.eta,
        });
      }

      return { processed: activeShipments.length };
    });
  },
});
