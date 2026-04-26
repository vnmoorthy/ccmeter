import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, TrendingDown, Database, AlertTriangle, Lightbulb, Clock } from "lucide-react";
import { api } from "../lib/api.js";
import { fmtPct, fmtTokens, fmtUSD, shortPath, shortModel } from "../lib/format.js";
import { Kpi } from "../components/Kpi.js";

const COLORS = ["#eaff00", "#7cffb2", "#7cd9ff", "#c597ff", "#ffa37c", "#ff7c97"];

export function OverviewPage({ days, pulse }: { days: number; pulse: number }): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["summary", days, pulse],
    queryFn: () => api.summary(days),
  });

  if (isLoading) return <SkeletonGrid />;
  if (error || !data) return <ErrorBox msg={String(error)} />;

  const half = Math.floor(data.daily.length / 2);
  const recent = data.daily.slice(half).reduce((a, b) => a + b.totalCost, 0);
  const prior = data.daily.slice(0, half).reduce((a, b) => a + b.totalCost, 0);
  const delta = prior === 0 ? 0 : (recent - prior) / prior;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label={`spend (${days}d)`}
          value={fmtUSD(data.totals.totalCost)}
          tone={delta > 0.1 ? "warn" : delta < -0.1 ? "good" : "neutral"}
          hint={
            <span className="flex items-center gap-1">
              {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {delta > 0 ? "+" : ""}
              {fmtPct(delta)} vs prior period
            </span>
          }
          icon={<Clock size={14} />}
        />
        <Kpi
          label="cache hit rate"
          value={fmtPct(data.totals.cacheHitRatio, 1)}
          tone={data.totals.cacheHitRatio < 0.5 ? "warn" : "good"}
          hint={`${fmtTokens(data.totals.cacheReadTokens)} read / ${fmtTokens(data.totals.cacheWriteTokens)} written`}
          icon={<Database size={14} />}
        />
        <Kpi
          label="cache busts"
          value={String(data.totals.busts)}
          tone={data.totals.busts > 50 ? "bad" : data.totals.busts > 5 ? "warn" : "good"}
          hint={`wasted ${fmtUSD(data.totals.bustCost)}`}
          icon={<AlertTriangle size={14} />}
        />
        <Kpi
          label="suggestions"
          value={String(data.recommendationsCount)}
          tone={data.recommendationsCount > 0 ? "warn" : "good"}
          hint="run: ccmeter recommend"
          icon={<Lightbulb size={14} />}
        />
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Daily spend</div>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={data.daily}>
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
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-elev)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
                formatter={(v: number) => fmtUSD(v)}
              />
              <Bar dataKey="totalCost" fill="var(--accent)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Spend by model</div>
          <div className="h-52">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.byModel.slice(0, 5).map((m) => ({
                    name: shortModel(m.model),
                    value: m.totalCost,
                  }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {data.byModel.slice(0, 5).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-elev)",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => fmtUSD(v)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <table className="mt-3">
            <tbody>
              {data.byModel.slice(0, 5).map((m, i) => (
                <tr key={m.model}>
                  <td>
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    {shortModel(m.model)}
                  </td>
                  <td className="mono text-right">{fmtUSD(m.totalCost)}</td>
                  <td className="text-right text-xs" style={{ color: "var(--text-dim)" }}>
                    {m.turns}t
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Top projects</div>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Sessions</th>
                <th className="text-right">Hit %</th>
              </tr>
            </thead>
            <tbody>
              {data.byProject.slice(0, 8).map((p) => (
                <tr key={p.projectPath}>
                  <td title={p.projectPath}>{shortPath(p.projectPath, 30)}</td>
                  <td className="mono text-right">{fmtUSD(p.totalCost)}</td>
                  <td className="text-right">{p.sessions}</td>
                  <td className="text-right">{fmtPct(p.cacheHitRatio, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SkeletonGrid(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="card p-4 animate-pulse"
            style={{ height: 110, background: "var(--bg-elev2)" }}
          />
        ))}
      </div>
      <div
        className="card animate-pulse"
        style={{ height: 240, background: "var(--bg-elev2)" }}
      />
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }): JSX.Element {
  return (
    <div className="card p-4" style={{ borderColor: "var(--bad)" }}>
      <div style={{ color: "var(--bad)" }} className="font-medium">
        couldn't load summary
      </div>
      <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
        {msg}
      </div>
    </div>
  );
}
