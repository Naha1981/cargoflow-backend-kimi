import { query } from "../lib/db";
import { runBrowserSkill } from "./browserSkillAdapter";

export async function enqueueWorkforceTask(
  tenantId: string,
  taskType: string,
  instruction: string,
  adapter: "browserSkill" | "playwright" | "file" | "email" | "api"
): Promise<Record<string, unknown>> {
  const [task] = await query<Record<string, unknown>>(
    "INSERT INTO workforce_tasks (tenant_id, task_type, instruction, adapter, status) " +
      "VALUES ($1,$2,$3,$4,'queued') RETURNING *",
    [tenantId, taskType, instruction, adapter]
  );
  return task;
}

export async function executeBrowserTask(
  tenantId: string,
  taskId: string
): Promise<Record<string, unknown>> {
  const [task] = await query<Record<string, any>>(
    "SELECT * FROM workforce_tasks WHERE id=$1 AND tenant_id=$2",
    [taskId, tenantId]
  );
  if (!task) throw new Error("Workforce task not found");

  await query(
    "UPDATE workforce_tasks SET status='running', started_at=now() WHERE id=$1 AND tenant_id=$2",
    [taskId, tenantId]
  );

  const result = await runBrowserSkill({ instruction: task.instruction });

  const status =
    result.status === "completed"
      ? "completed"
      : result.status === "unavailable"
        ? "blocked"
        : "failed";

  await query(
    "UPDATE workforce_tasks SET status=$1, result_json=$2, error_text=$3, finished_at=now() " +
      "WHERE id=$4 AND tenant_id=$5",
    [
      status,
      JSON.stringify(result),
      result.status === "completed" ? null : result.stderr ?? null,
      taskId,
      tenantId
    ]
  );

  await query(
    "INSERT INTO action_audit (tenant_id, task_id, action_type, outcome, details_json) " +
      "VALUES ($1,$2,'browser_execute',$3,$4)",
    [tenantId, taskId, result.status, JSON.stringify(result)]
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    sessionId: result.sessionId,
    trace: result.trace
  };
}
