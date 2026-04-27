import { task, wait } from "@trigger.dev/sdk/v3";
import { query } from "../../src/lib/db";
import { emitEvent, EventTypes } from "../../src/lib/event-emitter";
import { logger } from "../../src/lib/logger";
import { safeRun } from "../../src/lib/sentry";

export const approvalGate = task({
  id: "approval-gate",
  maxDuration: 300,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  queue: { name: "default", concurrencyLimit: 10 },
  run: async (payload: {
    runId: string;
    tenantId: string;
    shipmentId?: string;
    confidence: number;
    riskLevel: string;
  }) => {
    return safeRun({ runId: payload.runId, tenantId: payload.tenantId, taskName: "approval-gate" }, async () => {
      const { runId, tenantId, shipmentId, confidence, riskLevel } = payload;
      const log = logger.child({ runId, tenantId, task: "approval-gate" });

      const needsApproval = confidence < 0.7 || riskLevel === "high" || riskLevel === "critical";

      if (!needsApproval) {
        log.info("Approval not required; proceeding");
        return { approved: true, autoApproved: true };
      }

      log.info("Approval required; creating approval record");

      const approvalRows = await query<{ id: string }>(
        `INSERT INTO approvals (tenant_id, workflow_run_id, status)
         VALUES ($1, $2, 'pending') RETURNING id`,
        [tenantId, runId]
      );
      const approvalId = approvalRows[0].id;

      await query(
        `UPDATE workflow_runs SET status = 'awaiting_approval', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [runId, tenantId]
      );

      await emitEvent({
        tenantId,
        eventType: EventTypes.APPROVAL_REQUIRED,
        source: "approval-gate",
        partitionKey: runId,
        payload: { runId, approvalId, shipmentId, confidence, riskLevel },
      });

      // Wait for human approval via external signal
      log.info({ approvalId }, "Waiting for human approval...");
      await wait.for({ seconds: 300, callback: async () => {
        const rows = await query<{ status: string }>(
          `SELECT status FROM approvals WHERE id = $1 AND tenant_id = $2`,
          [approvalId, tenantId]
        );
        return rows[0]?.status === "approved" || rows[0]?.status === "rejected" ? "resolved" : "pending";
      }});

      const finalStatus = await query<{ status: string }>(
        `SELECT status FROM approvals WHERE id = $1 AND tenant_id = $2`,
        [approvalId, tenantId]
      );

      const status = finalStatus[0]?.status;
      if (status === "rejected") {
        await query(
          `UPDATE workflow_runs SET status = 'failed', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
          [runId, tenantId]
        );
        await emitEvent({
          tenantId,
          eventType: EventTypes.SHIPMENT_REJECTED,
          source: "approval-gate",
          partitionKey: runId,
          payload: { runId, approvalId, shipmentId },
        });
        log.info("Approval rejected; pipeline cancelled");
        return { approved: false, approvalId };
      }

      await emitEvent({
        tenantId,
        eventType: EventTypes.APPROVAL_RESOLVED,
        source: "approval-gate",
        partitionKey: runId,
        payload: { runId, approvalId, approved: true },
      });

      log.info("Approval granted; proceeding");
      return { approved: true, approvalId };
    });
  },
});
