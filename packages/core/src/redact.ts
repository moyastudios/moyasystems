const SENSITIVE = /secret|token|password|passwd|authorization|cookie|api[-_]?key|opencloud|signature|credential|code$/i;

/** Deep-copies `value`, replacing anything that looks sensitive. Applied to every audit payload and log line. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

/** Server log helper that never prints secrets. */
export function logError(message: string, err: unknown, extra?: Record<string, unknown>) {
  // Name, message and code only: never the input, URL or stack, which can contain credentials.
  const code = (err as { code?: unknown })?.code;
  const e = err instanceof Error ? { name: err.name, message: err.message.slice(0, 300), ...(typeof code === "string" ? { code } : {}) } : { message: "non-error thrown" };
  console.error(JSON.stringify({ level: "error", message, error: e, ...(redact(extra ?? {}) as object) }));
}
