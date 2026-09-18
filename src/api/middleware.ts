import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { query } from "../lib/db";
import { JWT_SECRET, JwtPayload, signToken } from "./auth";
import { logger } from "../lib/logger";

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  tenantId?: string;
}

async function resolveSupabaseIdentity(accessToken: string): Promise<JwtPayload | null> {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !anonKey || !serviceKey) return null;

  const authResponse = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!authResponse.ok) return null;

  const supabaseUser = await authResponse.json() as {
    id?: string;
    email?: string;
  };

  if (!supabaseUser.id || !supabaseUser.email) return null;

  const profileUrl =
    `${baseUrl}/rest/v1/profiles?select=tenant_id&user_id=eq.${encodeURIComponent(supabaseUser.id)}&limit=1`;

  const profileResponse = await fetch(profileUrl, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    }
  });

  if (!profileResponse.ok) return null;

  const profiles = await profileResponse.json() as Array<{ tenant_id?: string | null }>;
  const tenantId = profiles[0]?.tenant_id;
  if (!tenantId) return null;

  await query(
    "INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
    [tenantId, `CargoIQ tenant ${tenantId.slice(0, 8)}`]
  );

  const existing = await query<{
    id: string;
    tenant_id: string;
    email: string;
    role: string;
  }>(
    "SELECT id, tenant_id, email, role FROM users WHERE external_auth_id=$1 OR lower(email)=lower($2) LIMIT 1",
    [supabaseUser.id, supabaseUser.email]
  );

  if (existing.length > 0) {
    const user = existing[0];
    if (user.tenant_id !== tenantId) {
      throw new Error("Supabase identity is mapped to a different CargoIQ tenant.");
    }

    await query(
      "UPDATE users SET external_auth_id=$1, email=$2 WHERE id=$3",
      [supabaseUser.id, supabaseUser.email.toLowerCase(), user.id]
    );

    return {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email
    };
  }

  const created = await query<{
    id: string;
    tenant_id: string;
    email: string;
    role: string;
  }>(
    "INSERT INTO users (tenant_id, email, password_hash, role, external_auth_id) " +
      "VALUES ($1,$2,$3,'viewer',$4) RETURNING id, tenant_id, email, role",
    [
      tenantId,
      supabaseUser.email.toLowerCase(),
      "external-supabase-auth",
      supabaseUser.id
    ]
  );

  const user = created[0];
  return {
    userId: user.id,
    tenantId: user.tenant_id,
    role: user.role,
    email: user.email
  };
}

/**
 * Auth middleware.
 * Accepts the existing CargoIQ JWT. When Supabase integration is configured,
 * a valid Supabase access token is exchanged into the same internal JWT shape.
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice(7);

  try {
    try {
      const decoded = jwt.verify(token, JWT_SECRET!) as JwtPayload;
      req.user = decoded;
      req.tenantId = decoded.tenantId;
      return next();
    } catch {
      const external = await resolveSupabaseIdentity(token);
      if (!external) {
        return res.status(401).json({ error: "Invalid or expired access token" });
      }

      req.user = external;
      req.tenantId = external.tenantId;

      const internalToken = signToken(external);
      res.setHeader("X-CargoIQ-Session", internalToken);
      return next();
    }
  } catch (err) {
    logger.warn({ err }, "Authentication resolution failed");
    return res.status(401).json({ error: "Authentication failed" });
  }
}

/**
 * RBAC middleware factory.
 * Checks req.user.role against an allowed-roles list.
 */
const roleHierarchy: Record<string, number> = {
  admin: 100,
  ops: 90,
  compliance: 80,
  finance: 70,
  mining: 60,
  oil: 50,
  viewer: 10
};

export function requireRoles(
  ...allowedRoles: string[]
): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
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
