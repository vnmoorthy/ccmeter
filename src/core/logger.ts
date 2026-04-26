// Tiny leveled logger. Writes to stderr to keep stdout reserved for
// machine-readable output (export commands rely on that).

import pc from "picocolors";

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function envLevel(): Level {
  const raw = (process.env.CCMETER_LOG_LEVEL || "warn").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "warn";
}

let currentLevel: Level = envLevel();

export function setLevel(level: Level): void {
  currentLevel = level;
}

function should(level: Level): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function fmt(level: Level, msg: string): string {
  const tag =
    level === "debug"
      ? pc.gray("debug")
      : level === "info"
        ? pc.cyan("info ")
        : level === "warn"
          ? pc.yellow("warn ")
          : pc.red("error");
  return `${tag} ${msg}`;
}

export const log = {
  debug(msg: string, ...rest: unknown[]): void {
    if (should("debug")) process.stderr.write(`${fmt("debug", msg)}${formatRest(rest)}\n`);
  },
  info(msg: string, ...rest: unknown[]): void {
    if (should("info")) process.stderr.write(`${fmt("info", msg)}${formatRest(rest)}\n`);
  },
  warn(msg: string, ...rest: unknown[]): void {
    if (should("warn")) process.stderr.write(`${fmt("warn", msg)}${formatRest(rest)}\n`);
  },
  error(msg: string, ...rest: unknown[]): void {
    if (should("error")) process.stderr.write(`${fmt("error", msg)}${formatRest(rest)}\n`);
  },
};

function formatRest(rest: unknown[]): string {
  if (rest.length === 0) return "";
  try {
    return " " + rest.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join(" ");
  } catch {
    return "";
  }
}

let warnedOnceSet = new Set<string>();
export function warnOnce(key: string, msg: string): void {
  if (warnedOnceSet.has(key)) return;
  warnedOnceSet.add(key);
  log.warn(msg);
}
