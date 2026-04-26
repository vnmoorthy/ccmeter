// `ccmeter tag <session-id> <label>` — annotate a session for grouped reporting.
// `ccmeter tag --list`             — list all current tags.
// `ccmeter tag <id> --remove`      — drop one.
//
// Tags persist in ~/.config/ccmeter/tags.json. They're applied at the end of
// analyze() to decorate Session.tag, and every read command honors --tag <name>
// for filtering.

import pc from "picocolors";
import { readTags, setTag, deleteTag } from "../../core/tags.js";
import { analyze } from "../../core/analyze.js";
import { renderTable } from "../ui/table.js";
import { fmtUSD } from "../ui/format.js";

const { bold, dim, green, red } = pc;

export interface TagOptions {
  list?: boolean;
  remove?: boolean;
}

export async function runTag(
  sessionId: string | undefined,
  label: string | undefined,
  opts: TagOptions,
): Promise<void> {
  // Listing mode: print every tag, group by label, show window-aggregate cost.
  if (opts.list || (!sessionId && !label)) {
    await listTags();
    return;
  }
  if (!sessionId) {
    process.stderr.write(red("ccmeter tag: a session id is required.\n"));
    process.exitCode = 1;
    return;
  }
  if (opts.remove) {
    await deleteTag(sessionId);
    process.stdout.write(`${green("✓")} removed tag from ${dim(sessionId)}\n`);
    return;
  }
  if (!label) {
    process.stderr.write(red("ccmeter tag: a label is required (or pass --remove).\n"));
    process.exitCode = 1;
    return;
  }
  await setTag(sessionId, label);
  process.stdout.write(
    `${green("✓")} tagged ${dim(sessionId)} as ${bold(label)}\n` +
      dim(`run \`ccmeter sessions --tag ${label}\` to see all sessions with this tag.\n`),
  );
}

async function listTags(): Promise<void> {
  const tags = await readTags();
  const ids = Object.keys(tags);
  if (ids.length === 0) {
    process.stdout.write(
      dim("no tags yet. Tag a session: ") +
        "ccmeter tag <session-id> <label>\n" +
        dim("Find a session id: ") +
        "ccmeter sessions --top 10 --json\n",
    );
    return;
  }
  // Compute spend per tag using a 365-day window so old-tagged sessions show.
  const a = await analyze({ days: 365, fillGaps: false });
  const byTag = new Map<string, { sessions: number; cost: number; busts: number }>();
  for (const s of a.sessions) {
    if (!s.tag) continue;
    const cur = byTag.get(s.tag) ?? { sessions: 0, cost: 0, busts: 0 };
    cur.sessions += 1;
    cur.cost += s.cost.totalCost;
    cur.busts += s.cacheBusts.length;
    byTag.set(s.tag, cur);
  }
  process.stdout.write(`\nTags — last 365 days\n${"─".repeat(60)}\n`);
  process.stdout.write(
    renderTable({
      head: ["Tag", "Sessions", "Spend", "Busts"],
      align: ["left", "right", "right", "right"],
      rows: [...byTag.entries()]
        .sort((a, b) => b[1].cost - a[1].cost)
        .map(([tag, s]) => [
          bold(tag),
          String(s.sessions),
          fmtUSD(s.cost),
          String(s.busts),
        ]),
    }),
  );
  process.stdout.write(
    "\n" +
      dim(`${ids.length} tag${ids.length === 1 ? "" : "s"} stored. ` +
        `Show all sessions for one: ccmeter sessions --tag <name>\n`),
  );
}
