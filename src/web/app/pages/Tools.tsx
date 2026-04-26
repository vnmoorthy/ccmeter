// Per-tool cost breakdown — answers "which subagent ate the budget?".
// Identical model to the CLI command, rendered as a sortable table + bar.

import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { fmtUSD } from "../lib/format.js";

export function ToolsPage(props: { pulse: number }): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ["tools", props.pulse],
    queryFn: () => api.tools(),
  });

  if (isLoading || !data) {
    return <div className="text-sm text-dim">loading…</div>;
  }

  const total = data.reduce((acc, t) => acc + t.attributedCost, 0);
  const max = Math.max(...data.map((t) => t.attributedCost), 0.01);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-lg">Per-tool cost</h2>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Which tool calls (Bash, Read, Edit, …) drove your spend. Attributed
          cost = each turn's output + cache_write split equally across the
          tool_use blocks in that turn. Input/cache_read overhead is left
          un-attributed (under-attribute &gt; overclaim).
        </p>
      </div>
      {data.length === 0 ? (
        <div
          className="text-sm rounded-md p-4"
          style={{ background: "var(--surface)", color: "var(--text-dim)" }}
        >
          No tool_use blocks in this window. Either nothing was agentic,
          or your sessions don't include tool_use payloads.
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((t) => {
            const pct = (t.attributedCost / max) * 100;
            const share = total > 0 ? (t.attributedCost / total) * 100 : 0;
            return (
              <div
                key={t.name}
                className="rounded-md p-3"
                style={{ background: "var(--surface)" }}
              >
                <div className="flex items-baseline justify-between gap-4 mb-1">
                  <div className="font-mono font-semibold">{t.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                    {t.calls.toLocaleString()} calls · {t.sessionsUsedIn} sessions ·
                    avg {fmtUSD(t.avgCostPerCall)} / call
                  </div>
                  <div className="font-mono">{fmtUSD(t.attributedCost)}</div>
                  <div
                    className="text-xs font-mono w-12 text-right"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {share.toFixed(1)}%
                  </div>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--bg)" }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${pct}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
