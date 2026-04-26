import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Database } from "lucide-react";
import { api } from "../lib/api.js";
import { fmtPct, fmtUSD } from "../lib/format.js";
import { Kpi } from "../components/Kpi.js";

// The cache-TTL rollout was staggered through early March 2026 (per
// anthropics/claude-code#46829). The actual "knee" in any user's data
// depends on when their machine got the new default; this is the boundary
// we use for the auto-detected callout.
const TTL_ROLLOUT_START = "2026-03-01";

export function CachePage({ days, pulse }: { days: number; pulse: number }): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ["cache", days, pulse],
    queryFn: () => api.cache(days),
  });

  if (isLoading || !data) return <div style={{ color: "var(--text-dim)" }}>loading…</div>;

  const last7 = data.daily.slice(-7);
  const bust7 = last7.reduce((a, b) => a + b.bustCost, 0);
  const monthly = bust7 * (30 / 7);
  const hitSeries = data.daily.map((d) => {
    const denom = d.cacheReadTokens + d.cacheWriteTokens;
    return {
      date: d.date,
      hitPct: denom === 0 ? 0 : (d.cacheReadTokens / denom) * 100,
      busts: d.busts,
      bustCost: d.bustCost,
    };
  });
  const showTtlCallout =
    data.daily.some((d) => d.date >= TTL_ROLLOUT_START) &&
    data.daily.some((d) => d.date < TTL_ROLLOUT_START);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label={`hit rate (${days}d)`}
          value={fmtPct(data.hitRatio, 1)}
          tone={data.hitRatio < 0.5 ? "warn" : "good"}
          icon={<Database size={14} />}
        />
        <Kpi
          label="busts"
          value={String(data.busts)}
          tone={data.busts > 50 ? "bad" : data.busts > 5 ? "warn" : "good"}
          icon={<AlertTriangle size={14} />}
        />
        <Kpi
          label="wasted on busts"
          value={fmtUSD(data.bustCost)}
          tone="bad"
          hint="across the window"
        />
        <Kpi
          label="monthly run-rate (last 7d)"
          value={fmtUSD(monthly)}
          tone="warn"
          hint={`= ${fmtUSD(bust7)} last week × 30/7`}
        />
      </div>

      {showTtlCallout && (
        <div
          className="card p-4"
          style={{ borderColor: "var(--warn)", background: "rgba(246,183,60,.06)" }}
        >
          <div className="flex items-center gap-2 font-medium" style={{ color: "var(--warn)" }}>
            <AlertTriangle size={14} />
            Cache-TTL rollout window in your data (early March 2026)
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
            Anthropic shortened Claude Code's default prompt-cache TTL from 1h to 5m in early
            March 2026 (rollout staggered across users). Anthropic's position is that this
            should not raise costs; user data typically shows +30 to +60%. Compare your own
            pre/post numbers in the chart below.
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Cache hit rate over time</div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={hitSeries}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-elev)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
                formatter={(v: number) => `${v.toFixed(1)}%`}
              />
              {showApril2 && (
                <ReferenceLine
                  x={APRIL_2_2026}
                  stroke="var(--warn)"
                  strokeDasharray="3 3"
                  label={{ value: "Apr 2", fill: "var(--warn)", fontSize: 10, position: "top" }}
                />
              )}
              <Line
                type="monotone"
                dataKey="hitPct"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Daily bust cost</div>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={hitSeries}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-elev)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
                formatter={(v: number) => fmtUSD(v)}
              />
              <Bar dataKey="bustCost" fill="var(--bad)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Bust frequency heatmap (last 12 weeks)</div>
        <Heatmap days={data.daily.slice(-84)} />
      </div>
    </div>
  );
}

function Heatmap({ days }: { days: { date: string; busts: number }[] }): JSX.Element {
  const max = Math.max(1, ...days.map((d) => d.busts));
  const cellsByWeek: Array<typeof days> = [];
  let cur: typeof days = [];
  for (const d of days) {
    cur.push(d);
    if (new Date(d.date + "T00:00:00").getDay() === 6) {
      cellsByWeek.push(cur);
      cur = [];
    }
  }
  if (cur.length) cellsByWeek.push(cur);

  return (
    <div className="flex gap-1">
      {cellsByWeek.map((week, i) => (
        <div key={i} className="flex flex-col gap-1">
          {Array.from({ length: 7 }).map((_, dow) => {
            const cell = week[dow];
            if (!cell) return <div key={dow} style={{ width: 11, height: 11 }} />;
            const intensity = cell.busts / max;
            return (
              <div
                key={dow}
                title={`${cell.date}: ${cell.busts} busts`}
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 2,
                  background:
                    intensity === 0
                      ? "var(--bg-elev2)"
                      : `rgba(255,92,92,${0.15 + intensity * 0.85})`,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
