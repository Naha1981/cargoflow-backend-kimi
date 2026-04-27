import { query, tenantQuery, withTransaction } from "../src/lib/db";

describe("Database layer", () => {
  it("should run a basic query", async () => {
    const rows = await query("SELECT 1 as n");
    expect(rows[0].n).toBe(1);
  });

  it("should support transactions", async () => {
    const result = await withTransaction(async (trx) => {
      const rows = await trx.query("SELECT 2 as n");
      return rows[0].n;
    });
    expect(result).toBe(2);
  });

  it("should rollback on error", async () => {
    await expect(
      withTransaction(async () => {
        throw new Error("rollback test");
      })
    ).rejects.toThrow("rollback test");
  });
});
