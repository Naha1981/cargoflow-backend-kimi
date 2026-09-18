import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface BrowserTask {
  instruction: string;
  timeoutMs?: number;
}

export interface BrowserTaskResult {
  status: "completed" | "failed" | "unavailable";
  stdout: string;
  stderr?: string;
}

export async function runBrowserSkill(task: BrowserTask): Promise<BrowserTaskResult> {
  const bsk = process.env.BSK_BINARY || "bsk";

  try {
    const result = await execFileAsync(
      bsk,
      ["agent", "--json", "--task", task.instruction],
      {
        timeout: task.timeoutMs ?? 120000,
        windowsHide: true,
        env: { ...process.env }
      }
    );
    return { status: "completed", stdout: String(result.stdout), stderr: String(result.stderr) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|not found/i.test(message)) {
      return {
        status: "unavailable",
        stdout: "",
        stderr: "BrowserSkill/bsk is not installed on this worker."
      };
    }
    return { status: "failed", stdout: "", stderr: message };
  }
}
