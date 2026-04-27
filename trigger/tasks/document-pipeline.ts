import { task, tasks } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

import { ocrExtraction } from "./ocr-extraction";
import { documentClassification } from "./document-classification";
import { aiExtraction } from "./ai-extraction";
import { shipmentCreate } from "./shipment-create";
import { shipmentUpdate } from "./shipment-update";
import { complianceCheck } from "./compliance-check";
import { missingDocs } from "./missing-docs";
import { costCalculation } from "./cost-calculation";
import { marginAnalysis } from "./margin-analysis";
import { trackingUpdate } from "./tracking-update";
import { delayDetection } from "./delay-detection";
import { alertGenerator } from "./alert-generator";
import { riskScoring } from "./risk-scoring";
import { approvalGate } from "./approval-gate";
import { mineProcessing } from "./mine-processing";
import { oilCargoProcessing } from "./oil-cargo-processing";
import { executiveSummary } from "./executive-summary";

export const documentPipeline = task({
  id: "document-pipeline",
  maxDuration: 600,
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 60000 },
  queue: { name: "default", concurrencyLimit: 10 },
  run: async (payload: { runId: string; tenantId: string; filePath: string }) => {
    return safeRun({ runId: payload.runId, tenantId: payload.tenantId, taskName: "document-pipeline" }, async () => {
      const { runId, tenantId, filePath } = payload;
      const log = logger.child({ runId, tenantId, task: "document-pipeline" });

      log.info("Pipeline orchestrator started");

      await query(
        `UPDATE workflow_runs SET status = 'processing', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [runId, tenantId]
      );

      await emitEvent({
        tenantId,
        eventType: EventTypes.WORKFLOW_STARTED,
        source: "document-pipeline",
        partitionKey: runId,
        payload: { runId, filePath },
      });

      // 1. OCR
      const ocrResult = await tasks.triggerAndWait<typeof ocrExtraction>(
        "ocr-extraction",
        { runId, tenantId, filePath }
      );

      // 2. Classification
      const classification = await tasks.triggerAndWait<typeof documentClassification>(
        "document-classification",
        { runId, tenantId, text: ocrResult.text }
      );

      // 3. AI Extraction
      const extraction = await tasks.triggerAndWait<typeof aiExtraction>(
        "ai-extraction",
        { runId, tenantId, text: ocrResult.text, docType: classification.docType }
      );

      // 4. Shipment Create
      const shipment = await tasks.triggerAndWait<typeof shipmentCreate>(
        "shipment-create",
        { tenantId, runId, filePath, extracted: extraction.extracted, docType: classification.docType }
      );

      // 5. Shipment Update
      await tasks.triggerAndWait<typeof shipmentUpdate>(
        "shipment-update",
        { shipmentId: shipment.shipmentId, tenantId, data: extraction.extracted }
      );

      // 6. Compliance
      const compliance = await tasks.triggerAndWait<typeof complianceCheck>(
        "compliance-check",
        { shipmentId: shipment.shipmentId, tenantId, data: extraction.extracted }
      );

      // 7. Missing Docs
      if (compliance.missingDocuments?.length > 0) {
        await tasks.triggerAndWait<typeof missingDocs>(
          "missing-docs",
          { shipmentId: shipment.shipmentId, tenantId, missingDocuments: compliance.missingDocuments }
        );
      }

      // 8. Cost Calculation
      const costResult = await tasks.triggerAndWait<typeof costCalculation>(
        "cost-calculation",
        {
          shipmentId: shipment.shipmentId,
          tenantId,
          value: extraction.extracted.value || 0,
          incoterm: extraction.extracted.incoterm || "",
          origin: extraction.extracted.origin,
          destination: extraction.extracted.destination,
        }
      );

      // 9. Margin Analysis
      await tasks.triggerAndWait<typeof marginAnalysis>(
        "margin-analysis",
        {
          shipmentId: shipment.shipmentId,
          tenantId,
          marginPercentage: costResult.cost.margin || 0,
          lowMarginFlag: costResult.cost.low_margin_flag || false,
        }
      );

      // 10. Tracking Update
      if (extraction.extracted.eta || extraction.extracted.vessel) {
        await tasks.triggerAndWait<typeof trackingUpdate>(
          "tracking-update",
          {
            shipmentId: shipment.shipmentId,
            tenantId,
            eta: extraction.extracted.eta,
            vesselStatus: extraction.extracted.vessel,
          }
        );
      }

      // 11. Delay Detection
      if (extraction.extracted.eta && extraction.extracted.etd) {
        await tasks.triggerAndWait<typeof delayDetection>(
          "delay-detection",
          {
            shipmentId: shipment.shipmentId,
            tenantId,
            etaOriginal: extraction.extracted.etd,
            etaCurrent: extraction.extracted.eta,
          }
        );
      }

      // 12. Alert Generator
      const alerts = await tasks.triggerAndWait<typeof alertGenerator>(
        "alert-generator",
        {
          shipmentId: shipment.shipmentId,
          tenantId,
          context: {
            shipment: extraction.extracted,
            compliance,
            cost: costResult.cost,
            docType: classification.docType,
          },
        }
      );

      // 13. Risk Scoring
      const risk = await tasks.triggerAndWait<typeof riskScoring>(
        "risk-scoring",
        {
          shipmentId: shipment.shipmentId,
          tenantId,
          complianceStatus: compliance.complianceStatus,
          delayFlag: false,
          marginFlag: costResult.cost.low_margin_flag || false,
          missingDocs: (compliance.missingDocuments?.length || 0) > 0,
        }
      );

      // 14. Approval Gate
      const approval = await tasks.triggerAndWait<typeof approvalGate>(
        "approval-gate",
        {
          runId,
          tenantId,
          shipmentId: shipment.shipmentId,
          confidence: extraction.confidence || 0,
          riskLevel: risk.riskLevel,
        }
      );

      if (!approval.approved) {
        log.info("Pipeline halted at approval gate");
        return { status: "awaiting_approval", runId };
      }

      // 15. Domain fork
      if (classification.category === "mining") {
        await tasks.triggerAndWait<typeof mineProcessing>(
          "mine-processing",
          { tenantId, runId, extracted: extraction.extracted }
        );
      } else if (classification.category === "oil") {
        await tasks.triggerAndWait<typeof oilCargoProcessing>(
          "oil-cargo-processing",
          { tenantId, runId, extracted: extraction.extracted }
        );
      }

      // 16. Executive Summary
      const summary = await tasks.triggerAndWait<typeof executiveSummary>(
        "executive-summary",
        {
          tenantId,
          runId,
          context: {
            shipment: extraction.extracted,
            compliance,
            cost: costResult.cost,
            risk,
            alerts: alerts.risks,
            docType: classification.docType,
          },
        }
      );

      await query(
        `UPDATE workflow_runs SET status = 'completed', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [runId, tenantId]
      );

      await emitEvent({
        tenantId,
        eventType: EventTypes.WORKFLOW_COMPLETED,
        source: "document-pipeline",
        partitionKey: runId,
        payload: { runId, shipmentId: shipment.shipmentId, summaryId: summary.insightId },
      });

      log.info("Pipeline completed successfully");
      return { status: "completed", runId, shipmentId: shipment.shipmentId };
    });
  },
});
