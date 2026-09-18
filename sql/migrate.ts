import { config } from "dotenv";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { pool } from "../src/lib/db";

config();

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const explicit = process.argv[2];
    const migrationDir = resolve(process.cwd(), "sql");
    const files = explicit
      ? [explicit]
      : readdirSync(migrationDir)
          .filter((file) => /^\\d+.*\\.sql$/.test(file))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const file of files) {
      const sqlPath = explicit && !existsSync(file) ? join(migrationDir, file) : file;
      const filename = file.split("/").pop()!.split("\\\\").pop()!;

      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename=$1",
        [filename]
      );

      if (applied.rowCount) {
        console.log(`Migration already applied: ${filename}`);
        continue;
      }

      const sql = readFileSync(sqlPath, "utf-8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename]
        );
        await client.query("COMMIT");
        console.log(`Migration applied successfully: ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } catch (err) {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
