// Lightweight session-tag store, persisted at ~/.config/ccmeter/tags.json.
//
// Why tags exist: developers want to ask "how much did the auth-refactor PR
// cost me?" or "is the experimental refactor justifying its spend?". Letting
// users tag any session by ID — and then filter every other command by tag —
// turns ccmeter from a passive observer into something that fits a workflow.
//
// Storage shape (intentionally trivial):
//   { "<sessionId>": "<label>" }
//
// We never write tags during analyze() — only `ccmeter tag` writes. Reads
// happen at the end of analyze() to decorate Session.tag in place.

import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, getConfigDir } from "./paths.js";
import type { Session } from "./types.js";

const FILE_NAME = "tags.json";

export type TagMap = Record<string, string>;

function tagsFile(): string {
  return path.join(getConfigDir(), FILE_NAME);
}

export async function readTags(): Promise<TagMap> {
  try {
    const raw = await fs.readFile(tagsFile(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: TagMap = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string" && v.length > 0) out[k] = v;
      }
      return out;
    }
  } catch {
    /* missing file — fine */
  }
  return {};
}

export async function writeTags(tags: TagMap): Promise<void> {
  await ensureDir(getConfigDir());
  await fs.writeFile(tagsFile(), JSON.stringify(tags, null, 2) + "\n", "utf8");
}

export async function setTag(sessionId: string, label: string): Promise<void> {
  const tags = await readTags();
  tags[sessionId] = label;
  await writeTags(tags);
}

export async function deleteTag(sessionId: string): Promise<void> {
  const tags = await readTags();
  delete tags[sessionId];
  await writeTags(tags);
}

export async function applyTags(sessions: Session[]): Promise<void> {
  const tags = await readTags();
  if (Object.keys(tags).length === 0) return;
  for (const s of sessions) {
    const t = tags[s.id];
    if (t) s.tag = t;
  }
}
