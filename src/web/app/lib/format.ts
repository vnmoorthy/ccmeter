export function fmtUSD(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (Math.abs(n) >= 10) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

export function fmtPct(r: number, digits = 0): string {
  if (!Number.isFinite(r)) return "0%";
  return (r * 100).toFixed(digits) + "%";
}

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return Math.round(n / 1_000) + "k";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}

export function fmtDate(ms: number, kind: "short" | "datetime" = "short"): string {
  const d = new Date(ms);
  if (kind === "datetime") {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return `${h}h${m ? `${m}m` : ""}`;
}

export function shortPath(p: string, max = 36): string {
  if (!p) return "—";
  if (p.length <= max) return p;
  const parts = p.split("/").filter(Boolean);
  return ".../" + parts.slice(-2).join("/");
}

export function shortModel(m: string): string {
  return m.replace(/^claude-/, "").replace(/-202\d{5,}/, "");
}
