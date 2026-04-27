import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query, withTransaction } from "../lib/db";
import { logger } from "../lib/logger";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRES_IN = "7d";

export interface JwtPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * POST /api/auth/signup
 * Creates a tenant and its first admin user in a single transaction.
 * Returns a signed JWT containing userId, tenantId, and role.
 */
router.post("/signup", async (req, res) => {
  try {
    const { email, password, tenantName } = req.body;
    if (!email || !password || !tenantName) {
      return res.status(400).json({ error: "email, password, and tenantName are required" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await withTransaction(async (trx) => {
      const tenantRows = await trx.query(
        `INSERT INTO tenants (name, plan) VALUES ($1, 'trial') RETURNING id`,
        [tenantName]
      );
      const tenantId = tenantRows[0].id;

      const userRows = await trx.query(
        `INSERT INTO users (tenant_id, email, password_hash, role)
         VALUES ($1, $2, $3, 'admin') RETURNING id, tenant_id, email, role`,
        [tenantId, email.toLowerCase(), passwordHash]
      );
      const user = userRows[0];

      return { userId: user.id, tenantId: user.tenant_id, role: user.role, email: user.email };
    });

    const token = signToken(result);
    logger.info({ tenantId: result.tenantId, userId: result.userId }, "New tenant and admin created");

    return res.status(201).json({ token, user: { id: result.userId, email: result.email, role: result.role, tenantId: result.tenantId } });
  } catch (err: any) {
    if (err.message?.includes("duplicate key") || err.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    logger.error({ err }, "Signup failed");
    return res.status(500).json({ error: "Signup failed" });
  }
});

/**
 * POST /api/auth/login
 * Verifies password hash and returns a JWT.
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const users = await query<{ id: string; tenant_id: string; email: string; password_hash: string; role: string }>(
      `SELECT id, tenant_id, email, password_hash, role FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const payload: JwtPayload = {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    };

    const token = signToken(payload);
    logger.info({ userId: user.id, tenantId: user.tenant_id }, "User logged in");

    return res.json({ token, user: { id: user.id, email: user.email, role: user.role, tenantId: user.tenant_id } });
  } catch (err) {
    logger.error({ err }, "Login failed");
    return res.status(500).json({ error: "Login failed" });
  }
});

export { router as authRouter, signToken, JWT_SECRET };
