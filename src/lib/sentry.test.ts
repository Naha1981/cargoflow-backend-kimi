import { safeRun } from "./sentry";
import { query } from "./db";
import * as Sentry from "@sentry/node";

jest.mock("./db");
jest.mock("@sentry/node");

const mockedQuery = query as jest.MockedFunction<typeof query>;

describe("Sentry safeRun", () => {
  it("should return successful result", async () => {
    const result = await safeRun({ taskName: "test" }, async () => "success");
    expect(result).toBe("success");
  });

  it("should capture exception and update workflow_runs on failure", async () => {
    mockedQuery.mockResolvedValue([]);

    await expect(
      safeRun({ taskName: "test", runId: "run-1", tenantId: "t1" }, async () => {
        throw new Error("task failed");
      })
    ).rejects.toThrow("task failed");

    expect(Sentry.captureException).toHaveBeenCalled();
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE workflow_runs"),
      expect.any(Array)
    );
  });
});
