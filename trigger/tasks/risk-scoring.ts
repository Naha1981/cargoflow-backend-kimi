import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

export const riskScoring = task({
  id: "risk-scoring",
  maxDuration: 60,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "db-queue", concurrencyLimit: 20 },
  run: async (payload: {
    shipmentId: string;
    tenantId: string;
    complianceStatus: string;
    delayFlag: boolean;
    marginFlag: boolean;
    missingDocs: boolean;
  }) => {
    return safeRun({ tenantId: payload.tenantId, taskName: "risk-scoring" }, async () => {
      const { shipmentId, tenantId, complianceStatus, delayFlag, marginFlag, missingDocs } = payload;
      const log = logger.child({ shipmentId, tenantId, task: "risk-scoring" });

      log.info("Risk scoring started");

      let score = 0;
      if (complianceStatus === "non_compliant") score += 40;
      if (complianceStatus === "pending_review") score += 20;
      if (delayFlag) score += 25;
      if (marginFlag) score += 15;
      if (missingDocs) score += 10;

      let riskLevel: "low" | "medium" | "high" | "critical" = "low";
      if (score >= 70) riskLevel = "critical";
      else if (score >= 50) riskLevel = "high";
      else if (score >= 25) riskLevel = "medium";

      await query(
        `UPDATE shipments SET risk_level = $3 WHERE id = $1 AND tenant_id = $2`,
        [shipmentId, tenantId, riskLevel]
      );

      await emitEvent({
        tenantId,
        eventType: EventTypes.RISK_SCORED,
        source: "risk-scoring",
        partitionKey: shipmentId,
        payload: { shipmentId, riskLevel, score },
      });

      log.info({ score, riskLevel }, "Risk scoring completed");
      return { riskLevel, score };
    });
  },
});
