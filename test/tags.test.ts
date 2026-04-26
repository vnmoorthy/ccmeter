// Tag store: round-trip read/write/delete + applyTags decoration.

import { describe, it, expect, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  readTags,
  setTag,
  deleteTag,
  applyTags,
} from "../src/core/tags.js";
import type { Session } from "../src/core/types.js";

function fakeSession(id: string): Session {
  return {
    id,
    projectPath: "/tmp/x",
    startMs: 0,
    endMs: 0,
    durationMs: 0,
    models: [],
    primaryModel: "",
    turnCount: 0,
    toolUseCount: 0,
    cost: {
      inputCost: 0, outputCost: 0,
      cacheWriteCost: 0, cacheWrite5mCost: 0, cacheWrite1hCost: 0,
      cacheReadCost: 0, totalCost: 0,
      inputTokens: 0, outputTokens: 0,
      cacheWriteTokens: 0, cacheReadTokens: 0,
      model: "", cacheTier: "none",
    },
    cacheBusts: [],
    shape: "interactive",
    filePath: "",
    toolCalls: {},
    toolCost: {},
  };
}

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ccmeter-tags-"));
  process.env.CCMETER_CONFIG_DIR = tmp;
  // ensure clean slate
  try {
    await fs.unlink(path.join(tmp, "tags.json"));
  } catch {
    /* fine */
  }
});

describe("tags", () => {
  it("returns empty map when no file exists", async () => {
    expect(await readTags()).toEqual({});
  });

  it("setTag persists and reads back", async () => {
    await setTag("sess-1", "auth-refactor");
    await setTag("sess-2", "billing-fix");
    const t = await readTags();
    expect(t).toEqual({ "sess-1": "auth-refactor", "sess-2": "billing-fix" });
  });

  it("deleteTag removes the entry", async () => {
    await setTag("sess-1", "x");
    await deleteTag("sess-1");
    const t = await readTags();
    expect(t).toEqual({});
  });

  it("applyTags decorates sessions in place", async () => {
    await setTag("sess-1", "auth-refactor");
    const sessions = [fakeSession("sess-1"), fakeSession("sess-2")];
    await applyTags(sessions);
    expect(sessions[0]?.tag).toBe("auth-refactor");
    expect(sessions[1]?.tag).toBeUndefined();
  });
});
