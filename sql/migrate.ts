import { config } from "dotenv";
import { readFileSync } from "fs";
import { pool } from "../src/lib/db";

config();

async function migrate() {
  const sqlPath = process.argv[2] || "./sql/001_schema.sql";
  const sql = readFileSync(sqlPath, "utf-8");

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(`Migration applied successfully: ${sqlPath}`);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
