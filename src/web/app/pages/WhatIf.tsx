import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { fmtUSD } from "../lib/format.js";

const FAMILIES = [
  { id: "haiku", label: "Haiku" },
  { id: "sonnet", label: "Sonnet" },
  { id: "opus", label: "Opus" },
];

const PRICING_FAMILY: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  haiku: { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
  sonnet: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  opus: { input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 },
};

export function WhatIfPage({ days }: { days: number }): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ["whatif-summary", days],
    queryFn: () => api.summary(days),
  });
  const [opusTo, setOpusTo] = useState("opus");
  const [sonnetTo, setSonnetTo] = useState("sonnet");
  const [haikuTo, setHaikuTo] = useState("haiku");
  const [disableCache, setDisableCache] = useState(false);

  const sim = useMemo(() => {
    if (!data) return { actual: 0, simulated: 0, byModel: [] as Array<{ model: string; actual: number; simulated: number }> };
    let actual = 0;
    let simulated = 0;
    const rows: Array<{ model: string; actual: number; simulated: number }> = [];
    for (const m of data.byModel) {
      actual += m.totalCost;
      const fam = m.model.includes("opus") ? "opus" : m.model.includes("sonnet") ? "sonnet" : "haiku";
      const target = fam === "opus" ? opusTo : fam === "sonnet" ? sonnetTo : haikuTo;
      const t = PRICING_FAMILY[target] ?? PRICING_FAMILY[fam]!;
      const inCost = (m.inputTokens / 1e6) * t.input;
      const outCost = (m.outputTokens / 1e6) * t.output;
      const cacheRead = disableCache ? (m.cacheReadTokens / 1e6) * t.input : (m.cacheReadTokens / 1e6) * t.cacheRead;
      const cacheWrite = disableCache ? 0 : (m.cacheWriteTokens / 1e6) * t.cacheWrite;
      const sCost = inCost + outCost + cacheRead + cacheWrite;
      simulated += sCost;
      rows.push({ model: m.model, actual: m.totalCost, simulated: sCost });
    }
    return { actual, simulated, byModel: rows };
  }, [data, opusTo, sonnetTo, haikuTo, disableCache]);

  if (isLoading || !data) return <div style={{ color: "var(--text-dim)" }}>loading…</div>;
  const delta = sim.simulated - sim.actual;
  const monthly = (delta / Math.max(1, days)) * 30;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Model swap</div>
        <div className="grid grid-cols-3 gap-4">
          <Swap label="If you used Opus, run as…" value={opusTo} setValue={setOpusTo} />
          <Swap label="If you used Sonnet, run as…" value={sonnetTo} setValue={setSonnetTo} />
          <Swap label="If you used Haiku, run as…" value={haikuTo} setValue={setHaikuTo} />
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm">
          <input
            type="checkbox"
            checked={disableCache}
            onChange={(e) => setDisableCache(e.target.checked)}
          />
          assume cache is disabled (every read repays full input)
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Big label="Actual spend" value={fmtUSD(sim.actual)} tone="neutral" />
        <Big
          label="Simulated"
          value={fmtUSD(sim.simulated)}
          tone={delta < 0 ? "good" : delta > 0 ? "bad" : "neutral"}
        />
        <Big
          label={`Monthly delta`}
          value={(monthly > 0 ? "+" : "") + fmtUSD(monthly)}
          tone={monthly < 0 ? "good" : monthly > 0 ? "bad" : "neutral"}
        />
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Per-model comparison</div>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th className="text-right">Actual</th>
              <th className="text-right">Simulated</th>
              <th className="text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {sim.byModel.map((r) => {
              const d = r.simulated - r.actual;
              return (
                <tr key={r.model}>
                  <td>{r.model}</td>
                  <td className="mono text-right">{fmtUSD(r.actual)}</td>
                  <td className="mono text-right">{fmtUSD(r.simulated)}</td>
                  <td
                    className="mono text-right"
                    style={{ color: d < 0 ? "var(--good)" : d > 0 ? "var(--bad)" : "var(--text-dim)" }}
                  >
                    {(d > 0 ? "+" : "") + fmtUSD(d)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Swap({
  label,
  value,
  setValue,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
}): JSX.Element {
  return (
    <div>
      <div className="text-xs uppercase mb-1" style={{ color: "var(--text-dim)" }}>
        {label}
      </div>
      <div className="flex gap-1">
        {FAMILIES.map((f) => (
          <button
            key={f.id}
            className="btn"
            data-active={value === f.id}
            onClick={() => setValue(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Big({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "good" | "bad";
}): JSX.Element {
  const color = tone === "good" ? "var(--good)" : tone === "bad" ? "var(--bad)" : "var(--text)";
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
        {label}
      </div>
      <div className="mono text-2xl mt-2 font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
