import { describe, expect, test } from "vitest";
import { makeDemoAnalysis } from "../src/core/demo.js";

describe("demo data", () => {
  test("produces a non-empty Analysis", () => {
    const a = makeDemoAnalysis();
    expect(a.sessions.length).toBeGreaterThan(20);
    expect(a.totals.totalCost).toBeGreaterThan(0);
    expect(a.byProject.length).toBeGreaterThan(0);
    expect(a.byModel.length).toBeGreaterThan(0);
  });

  test("includes recommendations", () => {
    const a = makeDemoAnalysis();
    // demo data is intentionally bursty; should fire at least one rule
    expect(a.recommendations.length).toBeGreaterThan(0);
  });

  test("is deterministic for a given seed", () => {
    const a = makeDemoAnalysis(7);
    const b = makeDemoAnalysis(7);
    expect(a.totals.sessions).toBe(b.totals.sessions);
    expect(a.totals.totalCost).toBeCloseTo(b.totals.totalCost, 6);
  });
});
