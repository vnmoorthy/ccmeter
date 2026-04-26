import { describe, expect, test } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseFile } from "../src/core/jsonl/reader.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(here, "fixtures/sample-session.jsonl");

describe("jsonl parser", () => {
  test("parses valid lines, skips invalid ones", async () => {
    const stat = await fs.stat(FIXTURE);
    const r = await parseFile(FIXTURE, "k", stat.mtimeMs, stat.size);
    expect(r.turns.length).toBe(7);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]?.message).toMatch(/JSON\.parse/);
    expect(r.stats.totalLines).toBe(8);
    expect(r.stats.validTurns).toBe(7);
  });

  test("preserves session id", async () => {
    const stat = await fs.stat(FIXTURE);
    const r = await parseFile(FIXTURE, "k", stat.mtimeMs, stat.size);
    for (const t of r.turns) {
      expect(t.sessionId).toBe("sess-test-001");
    }
  });
});
