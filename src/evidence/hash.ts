import { createHash } from "crypto";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((key) => JSON.stringify(key) + ":" + canonical(obj[key])).join(",") + "}";
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
