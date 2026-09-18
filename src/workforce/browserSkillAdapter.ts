import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type BrowserStep =
  | { action: "navigate"; url: string }
  | { action: "snapshot" }
  | { action: "observe" }
  | { action: "screenshot"; out: string; ref?: string }
  | { action: "click"; target: string }
  | { action: "fill"; target: string; value: string }
  | { action: "select"; target: string; value: string }
  | { action: "press"; key: string; ref?: string }
  | { action: "request-help"; prompt: string; title?: string; target?: string };

export interface BrowserTask {
  instruction: string;
  allowedDomains?: string[];
  timeoutMs?: number;
}

export interface BrowserTaskResult {
  status: "completed" | "failed" | "unavailable";
  stdout: string;
  stderr?: string;
  sessionId?: string;
  trace?: Array<{ command: string; output: string }>;
}

interface BrowserPlan {
  steps: BrowserStep[];
  allowedDomains?: string[];
}

function parsePlan(instruction: string, allowedDomains?: string[]): BrowserPlan {
  const value = JSON.parse(instruction) as BrowserPlan;
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    throw new Error("BrowserSkill task must contain a non-empty JSON steps array.");
  }
  return { ...value, allowedDomains: value.allowedDomains ?? allowedDomains };
}

function validateUrl(url: string, allowedDomains?: string[]) {
  if (!allowedDomains?.length) return;
  const host = new URL(url).hostname.toLowerCase();
  const ok = allowedDomains.some((domain) => {
    const d = domain.toLowerCase().replace(/^https?:\\/\\//, "").split("/")[0];
    return host === d || host.endsWith("." + d);
  });
  if (!ok) throw new Error("Navigation blocked by workforce domain policy: " + host);
}

async function runBsk(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  const bsk = process.env.BSK_BINARY || "bsk";
  const result = await execFileAsync(bsk, [...args, "--json"], {
    timeout: timeoutMs,
    windowsHide: true,
    env: { ...process.env }
  });
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
}

function extractSessionId(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const id = parsed.session_id ?? parsed.sessionId ?? parsed.id;
    if (typeof id === "string" && id) return id;
  } catch {
    // Some BrowserSkill versions print the session id as plain text.
  }
  const match = stdout.match(/\\b([A-Za-z0-9]{4})\\b/);
  if (!match) throw new Error("BrowserSkill did not return a session id.");
  return match[1];
}

export async function runBrowserSkill(task: BrowserTask): Promise<BrowserTaskResult> {
  const timeoutMs = task.timeoutMs ?? 120000;
  const plan = parsePlan(task.instruction, task.allowedDomains);
  let sessionId: string | undefined;
  const trace: Array<{ command: string; output: string }> = [];

  try {
    const started = await runBsk(["session", "start"], timeoutMs);
    sessionId = extractSessionId(started.stdout);
    trace.push({ command: "session start", output: started.stdout });

    for (const step of plan.steps) {
      let args: string[];

      switch (step.action) {
        case "navigate":
          validateUrl(step.url, plan.allowedDomains);
          args = ["navigate", step.url, "--session", sessionId];
          break;
        case "snapshot":
          args = ["snapshot", "--session", sessionId];
          break;
        case "observe":
          args = ["observe", "--session", sessionId];
          break;
        case "screenshot":
          args = ["screenshot"];
          if (step.ref) args.push("--ref", step.ref);
          args.push("--out", step.out, "--session", sessionId);
          break;
        case "click":
          args = ["click", step.target, "--session", sessionId];
          break;
        case "fill":
          args = ["fill", step.target, "--value", step.value, "--session", sessionId];
          break;
        case "select":
          args = ["select", step.target, "--value", step.value, "--session", sessionId];
          break;
        case "press":
          args = ["press", step.key];
          if (step.ref) args.push("--ref", step.ref);
          args.push("--session", sessionId);
          break;
        case "request-help":
          args = ["request-help", "--session", sessionId, "--prompt", step.prompt];
          if (step.title) args.push("--title", step.title);
          if (step.target) args.push("--target", step.target);
          break;
        default:
          throw new Error("Unsupported BrowserSkill step.");
      }

      const result = await runBsk(args, timeoutMs);
      trace.push({ command: args.join(" "), output: result.stdout });
    }

    return {
      status: "completed",
      stdout: trace.map((item) => item.output).join("\n"),
      trace,
      sessionId
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|not found/i.test(message)) {
      return {
        status: "unavailable",
        stdout: "",
        stderr: "BrowserSkill/bsk is not installed on this worker."
      };
    }
    return { status: "failed", stdout: trace.map((item) => item.output).join("\n"), stderr: message, trace, sessionId };
  } finally {
    if (sessionId) {
      try {
        await runBsk(["session", "stop", sessionId], Math.min(timeoutMs, 30000));
      } catch {
        // Cleanup failure is recorded only by the task worker; never leak the session intentionally.
      }
    }
  }
}
