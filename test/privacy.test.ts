import { describe, expect, test } from "vitest";
import {
  redactPath,
  anonymizePath,
  anonymizeId,
  displayAnonymizePath,
  displayAnonymizeId,
} from "../src/core/privacy.js";

describe("privacy", () => {
  test("redactPath collapses Users dirs", () => {
    expect(redactPath("/Users/alice/work/repo")).toMatch(/^~/);
  });

  test("redactPath keeps tail visible", () => {
    expect(redactPath("/Users/alice/very/long/nested/path/repo")).toContain("repo");
  });

  test("anonymizePath produces stable hash", () => {
    expect(anonymizePath("/foo/bar")).toBe(anonymizePath("/foo/bar"));
    expect(anonymizePath("/foo/bar")).not.toBe(anonymizePath("/foo/baz"));
    expect(anonymizePath("/foo/bar")).toMatch(/^anon:\/\//);
  });

  test("anonymizeId is opaque and deterministic", () => {
    expect(anonymizeId("session-123")).toBe(anonymizeId("session-123"));
    expect(anonymizeId("session-123")).toMatch(/^id_/);
  });

  test("displayAnonymizePath produces friendly path-shaped labels", () => {
    expect(displayAnonymizePath("/Users/moorthy/Projects/CCmeter")).toMatch(
      /^~\/projects\/proj-[a-f0-9]{5}$/,
    );
    // distinct inputs → distinct labels
    expect(displayAnonymizePath("/a")).not.toBe(displayAnonymizePath("/b"));
    // stable across runs
    expect(displayAnonymizePath("/a")).toBe(displayAnonymizePath("/a"));
    // never leaks the original path text
    const orig = "/Users/moorthy/SECRET_PROJECT";
    const anon = displayAnonymizePath(orig);
    expect(anon.includes("SECRET_PROJECT")).toBe(false);
    expect(anon.includes("moorthy")).toBe(false);
  });

  test("displayAnonymizeId produces sess-<5> labels", () => {
    expect(displayAnonymizeId("abc-123")).toMatch(/^sess-[a-f0-9]{5}$/);
    expect(displayAnonymizeId("abc-123")).toBe(displayAnonymizeId("abc-123"));
  });
});
