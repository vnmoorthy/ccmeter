import type { ReactNode } from "react";

export function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
  icon?: ReactNode;
}): JSX.Element {
  const toneColor =
    tone === "good"
      ? "var(--good)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "bad"
          ? "var(--bad)"
          : "var(--text)";
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
        <span>{label}</span>
        {icon}
      </div>
      <div className="mono text-2xl mt-2 font-semibold" style={{ color: toneColor }}>
        {value}
      </div>
      {hint && (
        <div className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
