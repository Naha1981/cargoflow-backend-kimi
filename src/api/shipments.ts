import { Router } from "express";
import { query, tenantQuery, tenantQueryOne } from "../lib/db";
import { authMiddleware, AuthenticatedRequest, requireRoles } from "./middleware";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/shipments
 * List shipments for the tenant with optional filters.
 */
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { status, risk_level, limit = "50", offset = "0" } = req.query;

    let sql = `SELECT * FROM shipments WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
    if (risk_level) { sql += ` AND risk_level = $${idx++}`; params.push(risk_level); }

    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const rows = await query(sql, params);
    return res.json({ shipments: rows });
  } catch (err) {
    logger.error({ err }, "Failed to list shipments");
    return res.status(500).json({ error: "Failed to list shipments" });
  }
});

/**
 * GET /api/shipments/:id
 * Get a single shipment with its documents, costs, and alerts.
 */
router.get("/:id", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const shipmentId = req.params.id;

    const shipment = await tenantQueryOne(tenantId,
      `SELECT * FROM shipments WHERE tenant_id = $1 AND id = $2`,
      [shipmentId]
    );

    if (!shipment) {
      return res.status(404).json({ error: "Shipment not found" });
    }

    const documents = await tenantQuery(tenantId,
      `SELECT * FROM documents WHERE tenant_id = $1 AND shipment_id = $2 ORDER BY created_at DESC`,
      [shipmentId]
    );

    const costs = await tenantQueryOne(tenantId,
      `SELECT * FROM costs WHERE tenant_id = $1 AND shipment_id = $2`,
      [shipmentId]
    );

    const alerts = await tenantQuery(tenantId,
      `SELECT * FROM alerts WHERE tenant_id = $1 AND shipment_id = $2 ORDER BY created_at DESC`,
      [shipmentId]
    );

    return res.json({ shipment, documents, costs, alerts });
  } catch (err) {
    logger.error({ err }, "Failed to get shipment");
    return res.status(500).json({ error: "Failed to get shipment" });
  }
});

export { router as shipmentsRouter };
