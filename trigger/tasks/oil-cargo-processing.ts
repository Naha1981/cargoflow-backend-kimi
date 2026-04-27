import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

export const oilCargoProcessing = task({
  id: "oil-cargo-processing",
  maxDuration: 120,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "db-queue", concurrencyLimit: 20 },
  run: async (payload: {
    tenantId: string;
    runId: string;
    extracted: Record<string, any>;
  }) => {
    return safeRun({ runId: payload.runId, tenantId: payload.tenantId, taskName: "oil-cargo-processing" }, async () => {
      const { tenantId, runId, extracted } = payload;
      const log = logger.child({ runId, tenantId, task: "oil-cargo-processing" });

      log.info("Oil cargo processing started");

      const volume = extracted.volume_bbls ? parseFloat(extracted.volume_bbls) : null;
      const qualityPassed = extracted.quality_passed === true || extracted.quality_passed === "true";
      const volumeReconciled = volume !== null && volume > 0;

      const rows = await query<{ id: string }>(
        `INSERT INTO oil_cargos (
           tenant_id, vessel, imo_number, cargo_type, volume_bbls, volume_reconciled,
           quality_passed, loading_port, discharge_port, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (imo_number) DO UPDATE SET
           vessel = EXCLUDED.vessel,
           cargo_type = EXCLUDED.cargo_type,
           volume_bbls = EXCLUDED.volume_bbls,
           volume_reconciled = EXCLUDED.volume_reconciled,
           quality_passed = EXCLUDED.quality_passed,
           loading_port = EXCLUDED.loading_port,
           discharge_port = EXCLUDED.discharge_port,
           status = EXCLUDED.status
         RETURNING id`,
        [
          tenantId,
          extracted.vessel || null,
          extracted.imo_number || null,
          extracted.cargo_type || null,
          volume,
          volumeReconciled,
          qualityPassed,
          extracted.loading_port || null,
          extracted.discharge_port || null,
          extracted.status || "loading",
        ]
      );

      const cargoId = rows[0]?.id;

      if (!qualityPassed || !volumeReconciled) {
        await query(
          `INSERT INTO alerts (tenant_id, severity, message)
           VALUES ($1, 'high', $2)`,
          [tenantId, `Oil cargo ${extracted.vessel || extracted.imo_number} flagged: ${!qualityPassed ? "quality failed" : ""}${!qualityPassed && !volumeReconciled ? ", " : ""}${!volumeReconciled ? "volume unreconciled" : ""}`]
        );
      }

      await emitEvent({
        tenantId,
        eventType: EventTypes.WORKFLOW_COMPLETED,
        source: "oil-cargo-processing",
        partitionKey: runId,
        payload: { runId, cargoId, qualityPassed, volumeReconciled },
      });

      log.info({ cargoId }, "Oil cargo processing completed");
      return { cargoId, qualityPassed, volumeReconciled };
    });
  },
});
