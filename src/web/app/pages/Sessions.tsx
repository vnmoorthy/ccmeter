import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ArrowUpDown, X } from "lucide-react";
import { api, type SessionSummary } from "../lib/api.js";
import { fmtDate, fmtDuration, fmtUSD, shortModel, shortPath, fmtTokens } from "../lib/format.js";

type SortKey = "cost" | "duration" | "busts" | "date";

export function SessionsPage({ days, pulse }: { days: number; pulse: number }): JSX.Element {
  const [sort, setSort] = useState<SortKey>("cost");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<SessionSummary | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sessions", days, sort, pulse],
    queryFn: () => api.sessions({ top: 200, sort, days }),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!filter) return data;
    const f = filter.toLowerCase();
    return data.filter(
      (s) => s.projectPath.toLowerCase().includes(f) || s.id.includes(f),
    );
  }, [data, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="card flex items-center gap-2 px-3 flex-1"
          style={{ height: 36 }}
        >
          <Search size={14} style={{ color: "var(--text-dim)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by project or session id…"
            className="bg-transparent flex-1 outline-none text-sm"
            style={{ color: "var(--text)" }}
          />
          {filter && (
            <button onClick={() => setFilter("")} className="opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1 items-center">
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
            <ArrowUpDown size={12} className="inline mr-1" />
            sort
          </span>
          {(["cost", "duration", "busts", "date"] as SortKey[]).map((k) => (
            <button
              key={k}
              className="btn"
              data-active={sort === k}
              onClick={() => setSort(k)}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table>
          <thead>
            <tr>
              <th>Started</th>
              <th>Project</th>
              <th>Model</th>
              <th className="text-right">Duration</th>
              <th className="text-right">Turns</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Busts</th>
              <th>Shape</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="text-center py-8" style={{ color: "var(--text-dim)" }}>
                  loading…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8" style={{ color: "var(--text-dim)" }}>
                  no sessions match.
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr
                key={s.id}
                onClick={() => setSelected(s)}
                style={{ cursor: "pointer" }}
              >
                <td className="mono text-xs">{fmtDate(s.startMs, "datetime")}</td>
                <td title={s.projectPath}>{shortPath(s.projectPath, 26)}</td>
                <td className="text-xs">{shortModel(s.primaryModel)}</td>
                <td className="text-right">{fmtDuration(s.durationMs)}</td>
                <td className="text-right">{s.turnCount}</td>
                <td className="mono text-right">{fmtUSD(s.cost.totalCost)}</td>
                <td className="text-right">
                  {s.cacheBusts.length === 0 ? (
                    <span style={{ color: "var(--text-dim)" }}>0</span>
                  ) : (
                    <span className={s.cacheBusts.length > 5 ? "tag tag-bad" : "tag tag-warn"}>
                      {s.cacheBusts.length}
                    </span>
                  )}
                </td>
                <td>
                  <span className="tag">{s.shape}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <SessionDetail s={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function SessionDetail({ s, onClose }: { s: SessionSummary; onClose: () => void }): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-20 flex justify-end"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="card overflow-y-auto"
        style={{
          width: "min(560px, 95%)",
          height: "100%",
          borderRadius: 0,
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="font-medium text-sm">{shortPath(s.projectPath)}</div>
            <div className="mono text-xs mt-1" style={{ color: "var(--text-dim)" }}>
              {s.id}
            </div>
          </div>
          <button onClick={onClose} className="btn">
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat label="Started" value={fmtDate(s.startMs, "datetime")} />
          <Stat label="Duration" value={fmtDuration(s.durationMs)} />
          <Stat label="Model" value={shortModel(s.primaryModel)} />
          <Stat label="Shape" value={s.shape} />
          <Stat label="Turns" value={String(s.turnCount)} />
          <Stat label="Tool uses" value={String(s.toolUseCount)} />
        </div>

        <div className="card p-3 mb-4" style={{ background: "var(--bg-elev2)" }}>
          <div className="text-xs uppercase mb-2" style={{ color: "var(--text-dim)" }}>
            Cost breakdown
          </div>
          <div className="mono text-xl">{fmtUSD(s.cost.totalCost)}</div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <div>
              input: <span className="mono">{fmtTokens(s.cost.inputTokens)}</span>
            </div>
            <div>
              output: <span className="mono">{fmtTokens(s.cost.outputTokens)}</span>
            </div>
            <div>
              cache read: <span className="mono">{fmtTokens(s.cost.cacheReadTokens)}</span>
            </div>
            <div>
              cache write: <span className="mono">{fmtTokens(s.cost.cacheWriteTokens)}</span>
            </div>
          </div>
        </div>

        {s.cacheBusts.length > 0 && (
          <div className="card p-3" style={{ background: "var(--bg-elev2)" }}>
            <div className="text-xs uppercase mb-2" style={{ color: "var(--text-dim)" }}>
              Cache busts ({s.cacheBusts.length})
            </div>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Tier</th>
                  <th className="text-right">Gap</th>
                  <th className="text-right">Wasted</th>
                </tr>
              </thead>
              <tbody>
                {s.cacheBusts.map((b, i) => (
                  <tr key={i}>
                    <td className="mono text-xs">{fmtDate(b.ts, "datetime")}</td>
                    <td>{b.tier}</td>
                    <td className="text-right">{Math.round(b.gapSeconds)}s</td>
                    <td className="mono text-right">{fmtUSD(b.wastedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
        {label}
      </div>
      <div className="mono mt-1">{value}</div>
    </div>
  );
}
