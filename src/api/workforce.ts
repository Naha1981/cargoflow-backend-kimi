import { Router, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "./middleware";
import { enqueueWorkforceTask, executeBrowserTask } from "../workforce";

export const workforceRouter = Router();
workforceRouter.use(authMiddleware);

workforceRouter.post("/tasks", async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.tenantId) return res.status(401).json({ error: "Tenant missing" });
    return res.status(201).json(
      await enqueueWorkforceTask(
        req.tenantId,
        req.body.taskType,
        req.body.instruction,
        req.body.adapter
      )
    );
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

workforceRouter.post("/tasks/:id/execute", async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.tenantId) return res.status(401).json({ error: "Tenant missing" });
    return res.json(await executeBrowserTask(req.tenantId, req.params.id));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
