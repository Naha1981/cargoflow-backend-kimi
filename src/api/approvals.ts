import { Router } from "express";
import { query, tenantQuery } from "../lib/db";
import { authMiddleware, AuthenticatedRequest, requireRoles } from "./middleware";
import { emitEvent, EventTypes } from "../lib/event-emitter";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/approvals
 * List pending approvals for the tenant.
 */
router.get("/", authMiddleware, requireRoles("admin", "ops", "compliance"), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await tenantQuery(tenantId,
      `SELECT a.*, w.file_path, w.metadata
       FROM approvals a
       JOIN workflow_runs w ON w.id = a.workflow_run_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC
       LIMIT 50`
    );
    return res.json({ approvals: rows });
  } catch (err) {
    logger.error({ err }, "Failed to list approvals");
    return res.status(500).json({ error: "Failed to list approvals" });
  }
});

/**
 * PATCH /api/approvals/:id
 * Approve or reject a pending approval.
 */
router.patch("/:id", authMiddleware, requireRoles("admin", "ops", "compliance"), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const approvalId = req.params.id;
    const { status, notes } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be approved or rejected" });
    }

    const rows = await query<{ workflow_run_id: string }>(
      `UPDATE approvals
       SET status = $3, reviewed_by = $4, reviewed_at = now(), notes = $5
       WHERE id = $1 AND tenant_id = $2
       RETURNING workflow_run_id`,
      [approvalId, tenantId, status, req.user?.email || req.user?.userId, notes || null]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Approval not found" });
    }

    const runId = rows[0].workflow_run_id;

    await emitEvent({
      tenantId,
      eventType: EventTypes.APPROVAL_RESOLVED,
      source: "api",
      partitionKey: runId,
      payload: { approvalId, runId, status, reviewedBy: req.user?.email },
    });

    logger.info({ approvalId, status, tenantId }, "Approval resolved via API");
    return res.json({ approvalId, status });
  } catch (err) {
    logger.error({ err }, "Failed to resolve approval");
    return res.status(500).json({ error: "Failed to resolve approval" });
  }
});

export { router as approvalsRouter };
