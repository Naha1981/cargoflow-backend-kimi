import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JwtPayload } from "./auth";
import { logger } from "../lib/logger";

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  tenantId?: string;
}

/**
 * Auth middleware.
 * Extracts JWT from Authorization: Bearer header, verifies it,
 * and attaches req.user and req.tenantId.
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as JwtPayload;
    req.user = decoded;
    req.tenantId = decoded.tenantId;
    next();
  } catch (err) {
    logger.warn({ err }, "JWT verification failed");
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * RBAC middleware factory.
 * Checks req.user.role against an allowed-roles list.
 * Role hierarchy: admin > ops > compliance > finance > mining > oil > viewer
 */
const roleHierarchy: Record<string, number> = {
  admin: 100,
  ops: 90,
  compliance: 80,
  finance: 70,
  mining: 60,
  oil: 50,
  viewer: 10,
};

export function requireRoles(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userRole = req.user.role;
    const userLevel = roleHierarchy[userRole] || 0;
    const minRequired = Math.min(...allowedRoles.map((r) => roleHierarchy[r] || 0));

    if (userLevel < minRequired) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
}

/**
 * Middleware to require a specific API key for metrics endpoints.
 * Separate from JWT auth — used by Prometheus/Grafana scrapers.
 */
export function metricsApiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers["x-api-key"] as string;
  const expected = process.env.METRICS_API_KEY;

  if (!expected) {
    logger.warn("METRICS_API_KEY not configured; metrics endpoint is open");
    return next();
  }

  if (provided !== expected) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  next();
}
