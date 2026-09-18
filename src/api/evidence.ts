import { Router, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "./middleware";
import {
  addEvidence,
  collectPublicEvidence,
  createInvestigation,
  investigationReport
} from "../evidence/service";

export const evidenceRouter = Router();
evidenceRouter.use(authMiddleware);

evidenceRouter.post("/investigations", async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.tenantId) return res.status(401).json({ error: "Tenant missing" });
    return res.status(201).json(await createInvestigation(req.tenantId, req.body));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

evidenceRouter.post("/investigations/:id/collect", async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.tenantId) return res.status(401).json({ error: "Tenant missing" });
    return res.json(await collectPublicEvidence(req.tenantId, req.params.id));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

evidenceRouter.get("/investigations/:id/report", async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.tenantId) return res.status(401).json({ error: "Tenant missing" });
    return res.json(await investigationReport(req.tenantId, req.params.id));
  } catch (error) {
    return res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

evidenceRouter.post("/investigations/:id/evidence", async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.tenantId) return res.status(401).json({ error: "Tenant missing" });
    return res.status(201).json(await addEvidence(req.tenantId, req.params.id, req.body));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
