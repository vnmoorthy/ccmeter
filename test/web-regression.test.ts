// Source-scan regression tests for SPA bugs that escaped the build.
//
// We don't run jsdom in this repo (the SPA stays in src/web/app/* and the
// rest of the project is pure Node). These tests inspect the source files
// directly. They lock in the *specific patterns* /qa caught — the goal is
// "this exact bug never returns," not full component coverage.

import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(REPO, rel), "utf8");
}

describe("Cache.tsx — undefined-identifier regression (ISSUE-001)", () => {
  // Regression: ISSUE-001 — Cache route renders blank because Cache.tsx
  // referenced `showApril2` and `APRIL_2_2026`, which are defined nowhere.
  // ReferenceError fires on mount, React unmounts to nothing, no console
  // error visible to the user.
  // Found by /qa on 2026-04-28
  // Report: .gstack/qa-reports/qa-report-localhost-2026-04-28.md
  const src = read("src/web/app/pages/Cache.tsx");

  test("does not reference the old undefined identifiers", () => {
    expect(src).not.toMatch(/\bshowApril2\b/);
    expect(src).not.toMatch(/\bAPRIL_2_2026\b/);
  });

  test("uses the constants that are actually declared in the file", () => {
    expect(src).toMatch(/const TTL_ROLLOUT_START\s*=/);
    expect(src).toMatch(/const showTtlCallout\s*=/);
    // The reference line in the chart uses these too.
    expect(src).toMatch(/\bshowTtlCallout\b\s*&&[\s\S]{0,200}\bReferenceLine\b/);
    expect(src).toMatch(/x=\{TTL_ROLLOUT_START\}/);
  });
});

describe("App.tsx — hashchange listener regression (ISSUE-002)", () => {
  // Regression: ISSUE-002 — App.tsx read window.location.hash once at mount
  // and never installed a listener. Browser back/forward and deep-link
  // navigation left the URL pointing at one route while the SPA stayed on
  // another.
  // Found by /qa on 2026-04-28
  // Report: .gstack/qa-reports/qa-report-localhost-2026-04-28.md
  const src = read("src/web/app/App.tsx");

  test("registers a hashchange listener", () => {
    expect(src).toMatch(/addEventListener\(["']hashchange["']/);
    // and it must come paired with a removal in cleanup so the listener
    // doesn't leak across hot-reloads.
    expect(src).toMatch(/removeEventListener\(["']hashchange["']/);
  });

  test("the handler updates tab state, not just the URL", () => {
    // The hashchange useEffect must read window.location.hash AND call setTab.
    // If a future refactor only mirrors the URL into state without reading
    // it back on changes, this fails.
    const effectMatch = src.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?addEventListener\(["']hashchange["'][\s\S]*?\},\s*\[\s*\]\s*\)/,
    );
    expect(effectMatch).not.toBeNull();
    const region = effectMatch?.[0] ?? "";
    expect(region).toMatch(/window\.location\.hash/);
    expect(region).toMatch(/setTab\(/);
  });
});
