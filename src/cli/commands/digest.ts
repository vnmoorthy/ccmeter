// `ccmeter digest` — POST a weekly digest to Slack/Discord-compatible webhook.
// Network call! Only fires when --webhook or CCMETER_WEBHOOK_URL is set.

import pc from "picocolors";
import { analyze } from "../../core/analyze.js";
import { fmtPct, fmtUSD } from "../ui/format.js";
import { redactPath } from "../../core/privacy.js";

interface DigestOpts {
  webhook?: string;
  days?: string;
  dryRun?: boolean;
}

export async function runDigest(opts: DigestOpts): Promise<void> {
  const days = parseInt(String(opts.days ?? 7), 10);
  const url = opts.webhook ?? process.env.CCMETER_WEBHOOK_URL;
  if (!url && !opts.dryRun) {
    throw new Error(
      "no webhook URL provided. pass --webhook or set CCMETER_WEBHOOK_URL=…",
    );
  }
  const a = await analyze({ days });

  // detect Slack vs Discord vs generic
  const platform = detectPlatform(url ?? "");

  const topProj = a.byProject[0];
  const topRec = a.recommendations[0];

  const text = [
    `*ccmeter weekly digest* — last ${days} days`,
    `Spend: *${fmtUSD(a.totals.totalCost)}*  ·  Sessions: ${a.totals.sessions}  ·  Hit rate: ${fmtPct(a.totals.cacheHitRatio)}`,
    a.totals.busts > 0
      ? `Cache busts: ${a.totals.busts}  (wasted ${fmtUSD(a.totals.bustCost)})`
      : `Cache: clean ✓`,
    topProj ? `Top project: ${redactPath(topProj.projectPath)} (${fmtUSD(topProj.totalCost)})` : "",
    topRec
      ? `Top suggestion: ${topRec.title} — save ~${fmtUSD(topRec.estimatedMonthlySavings)}/mo`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  let payload: object;
  if (platform === "slack") {
    payload = {
      text,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text } },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "via `ccmeter digest`" }],
        },
      ],
    };
  } else if (platform === "discord") {
    payload = { content: text.replace(/\*/g, "**") };
  } else {
    payload = { text };
  }

  if (opts.dryRun) {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  const res = await fetch(url!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`webhook POST failed: ${res.status} ${body.slice(0, 200)}`);
  }
  process.stdout.write(pc.green(`✓ digest posted to ${platform} webhook\n`));
}

function detectPlatform(url: string): "slack" | "discord" | "generic" {
  if (url.includes("hooks.slack.com")) return "slack";
  if (url.includes("discord.com/api/webhooks") || url.includes("discordapp.com")) return "discord";
  return "generic";
}
