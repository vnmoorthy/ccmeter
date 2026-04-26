// `ccmeter export` — dump the analysis as json|csv|md.

import fs from "node:fs/promises";
import path from "node:path";
import { analyze } from "../../core/analyze.js";
import type { Analysis, Session } from "../../core/types.js";
import { redactPath, anonymizePath, anonymizeId } from "../../core/privacy.js";
import { fmtPct, fmtUSD } from "../ui/format.js";

interface ExportOpts {
  format?: string;
  out?: string;
  days?: string;
  redact?: boolean; // commander sets to false when --no-redact
  anonymize?: boolean;
}

export async function runExport(opts: ExportOpts): Promise<void> {
  const days = parseInt(String(opts.days ?? 30), 10);
  const fmt = (opts.format ?? "json").toLowerCase();
  const redact = opts.redact !== false; // default true
  const a = await analyze({ days });

  const transformed = transform(a, { redact, anonymize: !!opts.anonymize });

  let body: string;
  if (fmt === "json") body = JSON.stringify(transformed, null, 2) + "\n";
  else if (fmt === "csv") body = renderCsv(transformed);
  else if (fmt === "md") body = renderMarkdown(transformed);
  else throw new Error(`unknown format: ${fmt} (json|csv|md)`);

  if (opts.out) {
    await fs.mkdir(path.dirname(path.resolve(opts.out)), { recursive: true });
    await fs.writeFile(opts.out, body);
    process.stderr.write(`wrote ${body.length} bytes to ${opts.out}\n`);
  } else {
    process.stdout.write(body);
  }
}

function transform(
  a: Analysis,
  opts: { redact: boolean; anonymize: boolean },
): Analysis {
  if (!opts.redact && !opts.anonymize) return a;
  const fixPath = (p: string) =>
    opts.anonymize ? anonymizePath(p) : opts.redact ? redactPath(p) : p;
  const fixId = (s: string) => (opts.anonymize ? anonymizeId(s) : s);
  return {
    ...a,
    sessions: a.sessions.map((s: Session) => ({
      ...s,
      id: fixId(s.id),
      projectPath: fixPath(s.projectPath),
      filePath: opts.anonymize ? anonymizePath(s.filePath) : s.filePath,
      cacheBusts: s.cacheBusts.map((b) => ({ ...b, sessionId: fixId(b.sessionId) })),
    })),
    byProject: a.byProject.map((p) => ({ ...p, projectPath: fixPath(p.projectPath) })),
    recommendations: a.recommendations.map((r) => ({
      ...r,
      evidence: r.evidence.map((e) => ({
        ...e,
        sessionId: fixId(e.sessionId),
        projectPath: fixPath(e.projectPath),
      })),
    })),
  };
}

function renderCsv(a: Analysis): string {
  const header =
    "sessionId,project,startedAt,durationSec,model,turns,toolUses,inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,totalCost,bustCount,bustCost,shape\n";
  const rows = a.sessions
    .map((s) =>
      [
        csv(s.id),
        csv(s.projectPath),
        csv(new Date(s.startMs).toISOString()),
        Math.round(s.durationMs / 1000),
        csv(s.primaryModel),
        s.turnCount,
        s.toolUseCount,
        s.cost.inputTokens,
        s.cost.outputTokens,
        s.cost.cacheReadTokens,
        s.cost.cacheWriteTokens,
        s.cost.totalCost.toFixed(6),
        s.cacheBusts.length,
        s.cacheBusts.reduce((acc, b) => acc + b.wastedCost, 0).toFixed(6),
        s.shape,
      ].join(","),
    )
    .join("\n");
  return header + rows + "\n";
}

function csv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function renderMarkdown(a: Analysis): string {
  const lines: string[] = [];
  lines.push(`# ccmeter report`);
  lines.push(``);
  lines.push(
    `Generated ${new Date(a.generatedAt).toISOString()} · range ${new Date(a.rangeStartMs).toISOString().slice(0, 10)} → ${new Date(a.rangeEndMs).toISOString().slice(0, 10)}`,
  );
  lines.push(``);
  lines.push(`## Totals`);
  lines.push(``);
  lines.push(`- **Spend:** ${fmtUSD(a.totals.totalCost)}`);
  lines.push(`- **Sessions:** ${a.totals.sessions}`);
  lines.push(`- **Turns:** ${a.totals.turns}`);
  lines.push(`- **Cache hit rate:** ${fmtPct(a.totals.cacheHitRatio)}`);
  lines.push(`- **Cache busts:** ${a.totals.busts} (wasted ${fmtUSD(a.totals.bustCost)})`);
  lines.push(``);
  lines.push(`## Spend by model`);
  lines.push(``);
  lines.push(`| Model | Cost | Turns |`);
  lines.push(`|---|---:|---:|`);
  for (const m of a.byModel) lines.push(`| ${m.model} | ${fmtUSD(m.totalCost)} | ${m.turns} |`);
  lines.push(``);
  if (a.byTool && a.byTool.length > 0) {
    lines.push(`## Spend by tool`);
    lines.push(``);
    lines.push(`| Tool | Calls | Sessions | Attributed | $/call |`);
    lines.push(`|---|---:|---:|---:|---:|`);
    for (const t of a.byTool.slice(0, 12)) {
      lines.push(
        `| ${t.name} | ${t.calls} | ${t.sessionsUsedIn} | ${fmtUSD(t.attributedCost)} | ${fmtUSD(t.avgCostPerCall)} |`,
      );
    }
    lines.push(``);
  }
  lines.push(`## Top projects`);
  lines.push(``);
  lines.push(`| Project | Cost | Sessions | Hit % |`);
  lines.push(`|---|---:|---:|---:|`);
  for (const p of a.byProject.slice(0, 10))
    lines.push(
      `| ${p.projectPath} | ${fmtUSD(p.totalCost)} | ${p.sessions} | ${fmtPct(p.cacheHitRatio, 0)} |`,
    );
  lines.push(``);
  if (a.recommendations.length > 0) {
    lines.push(`## Recommendations`);
    lines.push(``);
    for (const r of a.recommendations) {
      lines.push(`### ${r.title}`);
      lines.push(``);
      lines.push(`*${r.severity.toUpperCase()} · ~${fmtUSD(r.estimatedMonthlySavings)}/month*`);
      lines.push(``);
      lines.push(r.body);
      lines.push(``);
    }
  }
  lines.push(`---`);
  lines.push(`Generated by [ccmeter](https://github.com/vnmoorthy/ccmeter)`);
  return lines.join("\n") + "\n";
}
