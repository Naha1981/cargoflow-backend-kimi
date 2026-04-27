import { Pool } from "pg";
import { config } from "dotenv";

config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
  process.exit(-1);
});

/**
 * Tenant-safe query helper.
 * Prepend tenant_id as the first parameter ($1) automatically.
 * This prevents any cross-tenant query from being written accidentally.
 */
export async function tenantQuery<T = any>(
  tenantId: string,
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, [tenantId, ...params]);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

/**
 * Tenant-safe query helper for single-row results.
 */
export async function tenantQueryOne<T = any>(
  tenantId: string,
  sql: string,
  params: any[] = []
): Promise<T | null> {
  const rows = await tenantQuery<T>(tenantId, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Generic query helper (for migrations, auth, or when tenant is unknown).
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Transaction helper.
 * All queries in the callback run inside a single transaction.
 * tenant_id is injected as the first parameter for all tenantQuery calls.
 */
export async function withTransaction<T>(
  fn: (trx: {
    query: (sql: string, params?: any[]) => Promise<any[]>;
    queryOne: (sql: string, params?: any[]) => Promise<any | null>;
    tenantQuery: (tenantId: string, sql: string, params?: any[]) => Promise<any[]>;
    tenantQueryOne: (tenantId: string, sql: string, params?: any[]) => Promise<any | null>;
  }) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const trx = {
      query: (sql: string, params: any[] = []) => client.query(sql, params).then((r) => r.rows),
      queryOne: (sql: string, params: any[] = []) =>
        client.query(sql, params).then((r) => (r.rows.length > 0 ? r.rows[0] : null)),
      tenantQuery: (tenantId: string, sql: string, params: any[] = []) =>
        client.query(sql, [tenantId, ...params]).then((r) => r.rows),
      tenantQueryOne: (tenantId: string, sql: string, params: any[] = []) =>
        client.query(sql, [tenantId, ...params]).then((r) => (r.rows.length > 0 ? r.rows[0] : null)),
    };
    const result = await fn(trx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
