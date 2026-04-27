import { task } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";
import { callKimi, parseKimiJson, SystemPrompts } from "../../src/lib/ai";

export const complianceCheck = task({
  id: "compliance-check",
  maxDuration: 120,
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "ai-queue", concurrencyLimit: 10 },
  run: async (payload: {
    shipmentId: string;
    tenantId: string;
    data: Record<string, any>;
  }) => {
    return safeRun({ tenantId: payload.tenantId, taskName: "compliance-check" }, async () => {
      const { shipmentId, tenantId, data } = payload;
      const log = logger.child({ shipmentId, tenantId, task: "compliance-check" });

      log.info("Compliance check started");

      const { content } = await callKimi({
        systemPrompt: SystemPrompts.compliance,
        userPrompt: JSON.stringify(data, null, 2),
        temperature: 0.1,
        maxTokens: 1000,
      });

      const parsed = parseKimiJson(content);
      const complianceStatus = parsed.data?.complianceStatus || "pending_review";
      const missingDocuments = parsed.data?.missingDocuments || [];
      const riskFlags = parsed.data?.riskFlags || [];
      const confidence = parsed.confidence || 0.0;

      await query(
        `INSERT INTO ai_insights (tenant_id, shipment_id, summary, risks, recommendations)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          tenantId,
          shipmentId,
          `Compliance status: ${complianceStatus}`,
          JSON.stringify(riskFlags),
          JSON.stringify(missingDocuments.map((d: string) => `Provide missing document: ${d}`)),
        ]
      );

      if (riskFlags.includes("high_risk") || riskFlags.includes("critical_risk")) {
        await query(
          `UPDATE shipments SET risk_level = 'high' WHERE id = $1 AND tenant_id = $2`,
          [shipmentId, tenantId]
        );
      }

      await emitEvent({
        tenantId,
        eventType: EventTypes.COMPLIANCE_CHECKED,
        source: "compliance-check",
        partitionKey: shipmentId,
        payload: { shipmentId, complianceStatus, missingDocuments, riskFlags, confidence },
      });

      log.info({ complianceStatus, missingCount: missingDocuments.length }, "Compliance check completed");
      return { complianceStatus, riskLevel: complianceStatus === "compliant" ? "low" : "medium", missingDocuments, riskFlags };
    });
  },
});
