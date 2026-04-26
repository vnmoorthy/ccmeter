// Display helpers used across every CLI command.
// Stick to plain US-English formatting unless overridden by env.

import pc from "picocolors";

export function fmtUSD(n: number, opts: { sign?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "$0.00";
  const sign = opts.sign && n > 0 ? "+" : "";
  if (Math.abs(n) >= 100) return `${sign}$${n.toFixed(0)}`;
  if (Math.abs(n) >= 10) return `${sign}$${n.toFixed(2)}`;
  return `${sign}$${n.toFixed(2)}`;
}

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(0) + "k";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}

export function fmtPct(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "0%";
  return (ratio * 100).toFixed(digits) + "%";
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m${rs ? ` ${rs}s` : ""}`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${rm ? ` ${rm}m` : ""}`;
}

export function fmtDate(ms: number, kind: "short" | "datetime" = "datetime"): string {
  const d = new Date(ms);
  if (kind === "short") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function trendArrow(deltaRatio: number): string {
  if (Math.abs(deltaRatio) < 0.02) return pc.gray("→ flat");
  if (deltaRatio > 0) return pc.red(`↑ +${(deltaRatio * 100).toFixed(0)}%`);
  return pc.green(`↓ ${(deltaRatio * 100).toFixed(0)}%`);
}

export function shortPath(p: string, max = 40): string {
  if (!p) return "(unknown)";
  if (p.length <= max) return p;
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return "…/" + p.slice(-max + 2);
  return "…/" + parts.slice(-2).join("/");
}

export function paint(level: "ok" | "warn" | "alarm", text: string): string {
  if (level === "ok") return pc.green(text);
  if (level === "warn") return pc.yellow(text);
  return pc.red(text);
}

export function bold(s: string): string {
  return pc.bold(s);
}

export function dim(s: string): string {
  return pc.dim(s);
}

export function divider(width = 60): string {
  return pc.gray("─".repeat(width));
}
