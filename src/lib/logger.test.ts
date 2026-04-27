import { logger, taskLogger } from "./logger";

describe("Logger", () => {
  it("should create a child logger with context", () => {
    const child = taskLogger({ tenantId: "t1", runId: "r1", taskId: "task-1" });
    expect(child).toBeDefined();
  });

  it("should have logger instance", () => {
    expect(logger).toBeDefined();
  });
});
