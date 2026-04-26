import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { api, type Recommendation } from "../lib/api.js";
import { fmtDate, fmtUSD, shortPath } from "../lib/format.js";

export function RecommendationsPage({ pulse }: { pulse: number }): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ["recs", pulse],
    queryFn: () => api.recommendations(),
  });

  if (isLoading) return <div style={{ color: "var(--text-dim)" }}>loading…</div>;
  if (!data || data.length === 0)
    return (
      <div className="card p-6 text-center">
        <Lightbulb className="mx-auto mb-2" size={28} style={{ color: "var(--good)" }} />
        <div className="font-medium">No recommendations</div>
        <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
          Your usage looks healthy. Rules will surface as you accumulate history.
        </div>
      </div>
    );

  const totalSavings = data.reduce((a, r) => a + r.estimatedMonthlySavings, 0);

  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase" style={{ color: "var(--text-dim)" }}>
            Estimated monthly savings if you act on all
          </div>
          <div className="mono text-2xl mt-1" style={{ color: "var(--accent)" }}>
            {fmtUSD(totalSavings)}
          </div>
        </div>
        <Lightbulb size={32} style={{ color: "var(--accent)" }} />
      </div>

      {data.map((r) => (
        <RecCard key={r.id} r={r} />
      ))}
    </div>
  );
}

function RecCard({ r }: { r: Recommendation }): JSX.Element {
  const [open, setOpen] = useState(false);
  const sevColor =
    r.severity === "high" ? "var(--bad)" : r.severity === "warn" ? "var(--warn)" : "var(--text-dim)";
  return (
    <div className="card p-4">
      <button
        className="w-full text-left flex items-start justify-between"
        onClick={() => setOpen((o) => !o)}
      >
        <div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,255,255,.06)", color: sevColor }}
            >
              {r.severity}
            </span>
            <div className="font-medium">{r.title}</div>
          </div>
          {r.estimatedMonthlySavings > 0 && (
            <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
              save ~{fmtUSD(r.estimatedMonthlySavings)}/month
            </div>
          )}
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <>
          <div className="text-sm mt-3 whitespace-pre-line" style={{ color: "var(--text-dim)" }}>
            {r.body}
          </div>
          {r.evidence.length > 0 && (
            <div className="mt-3">
              <div className="text-xs uppercase mb-2" style={{ color: "var(--text-dim)" }}>
                Evidence
              </div>
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Project</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {r.evidence.map((e, i) => (
                    <tr key={i}>
                      <td className="mono text-xs">{fmtDate(e.ts, "datetime")}</td>
                      <td>{shortPath(e.projectPath, 30)}</td>
                      <td className="text-xs" style={{ color: "var(--text-dim)" }}>
                        {e.note ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
