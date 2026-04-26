// decodeProjectDirName encoding round-trips for both POSIX and Windows.
// This is a best-effort heuristic and is only consulted when no turn in the
// session log carries an explicit cwd field, but the logic should still be
// correct for the common shapes Claude Code writes.

import { describe, it, expect } from "vitest";
import { decodeProjectDirName } from "../src/core/paths.js";

describe("decodeProjectDirName", () => {
  it("decodes POSIX absolute paths", () => {
    expect(decodeProjectDirName("-Users-moorthy-Projects-CCmeter")).toBe(
      "/Users/moorthy/Projects/CCmeter",
    );
  });

  it("decodes Windows drive-prefixed paths", () => {
    expect(decodeProjectDirName("C--Users-moorthy-Projects-CCmeter")).toBe(
      "C:\\Users\\moorthy\\Projects\\CCmeter",
    );
  });

  it("leaves un-encoded names alone", () => {
    expect(decodeProjectDirName("plain-folder-name")).toBe("plain-folder-name");
  });

  it("handles empty / single-segment", () => {
    expect(decodeProjectDirName("-")).toBe("/");
    expect(decodeProjectDirName("foo")).toBe("foo");
  });
});
