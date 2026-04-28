// CLI input-validation tests.
//
// Covers the four bug fixes shipped on this branch:
//   1. selftest reports the canonical VERSION (was hardcoded "0.2.0")
//   2. unknown subcommand errors with did-you-mean (was silently running summary)
//   3. parsePositiveInt rejects non-integers across --days/--top/--port/etc.
//   4. whatif --swap validates model names against the pricing table

import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSwaps } from "../src/cli/commands/whatif.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, "..", "bin", "ccmeter.js");

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function run(args: string[]): RunResult {
  try {
    const stdout = execFileSync("node", [BIN, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      // Point at an empty log dir so we don't depend on the test runner's
      // ~/.claude/projects state. Errors-vs-no-errors is what we're checking.
      env: { ...process.env, CCMETER_LOG_DIR: "/tmp/ccmeter-test-no-such-dir" },
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    return {
      stdout: typeof e.stdout === "string" ? e.stdout : (e.stdout?.toString() ?? ""),
      stderr: typeof e.stderr === "string" ? e.stderr : (e.stderr?.toString() ?? ""),
      status: e.status ?? 1,
    };
  }
}

describe("selftest version", () => {
  test("reports the canonical VERSION, not a hardcoded fallback", () => {
    const r = run(["selftest", "--max-files", "1"]);
    // selftest prints "ccmeter X.Y.Z · node ..." in its environment line.
    // Should match the version from package.json (read via src/cli/index.ts).
    expect(r.stdout).toMatch(/ccmeter 0\.3\.2\b/);
    expect(r.stdout).not.toMatch(/ccmeter 0\.2\.0\b/);
  });
});

describe("unknown command rejection", () => {
  test("rejects an unknown command with exit 1", () => {
    const r = run(["notarealcommand"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unknown command 'notarealcommand'/);
  });

  test("suggests the closest known command for typos", () => {
    const r = run(["dahsboard"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Did you mean 'dashboard'/);
  });

  test("does not suggest anything for unrelated junk", () => {
    const r = run(["zzqqxxyy"]);
    expect(r.status).toBe(1);
    expect(r.stderr).not.toMatch(/Did you mean/);
  });

  test("does not reject when the first non-flag token is a real command", () => {
    const r = run(["doctor"]);
    expect(r.status).toBe(0);
  });

  test("skips global flags before looking for the command", () => {
    // `--log-dir <path>` consumes a value token; the command after it must still resolve.
    const r = run(["--log-dir", "/tmp/ccmeter-test-no-such-dir", "doctor"]);
    expect(r.status).toBe(0);
  });
});

describe("--days validator", () => {
  test("rejects non-numeric input", () => {
    const r = run(["summary", "--days", "abc"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--days must be a positive integer/);
    // The user-visible "last NaN days" regression must NOT recur.
    expect(r.stdout).not.toMatch(/last NaN days/);
  });

  test("rejects zero", () => {
    const r = run(["summary", "--days", "0"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/positive integer/);
  });

  test("rejects negative numbers", () => {
    const r = run(["summary", "--days", "-5"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/positive integer/);
  });

  test("rejects floats", () => {
    const r = run(["summary", "--days", "7.5"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/positive integer/);
  });

  test("accepts valid positive integers", () => {
    const r = run(["summary", "--days", "7"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/last 7 days/);
  });
});

describe("--top validator (sessions/prompts)", () => {
  test("rejects non-numeric --top", () => {
    const r = run(["sessions", "--top", "abc"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--top must be a positive integer/);
  });
});

describe("whatif --swap validation", () => {
  test("accepts family aliases on both sides", () => {
    expect(parseSwaps(["opus->sonnet"])).toEqual([{ from: "opus", to: "sonnet" }]);
    expect(parseSwaps(["sonnet->haiku"])).toEqual([{ from: "sonnet", to: "haiku" }]);
  });

  test("accepts full known model ids", () => {
    expect(parseSwaps(["claude-opus-4-7->claude-sonnet-4-6"])).toEqual([
      { from: "claude-opus-4-7", to: "claude-sonnet-4-6" },
    ]);
  });

  test("accepts dated suffix variants via prefix match", () => {
    // pricingFor's lenient resolver treats "claude-opus-4-7-20251105" as opus-4-7.
    // The validator must allow the same.
    expect(parseSwaps(["claude-opus-4-7-20251105->sonnet"])).toEqual([
      { from: "claude-opus-4-7-20251105", to: "sonnet" },
    ]);
  });

  test("rejects unknown family-like tokens", () => {
    expect(() => parseSwaps(["xyz->abc"])).toThrow(/unknown model 'xyz'/);
  });

  test("rejects single-letter prefixes (closes the c->c loophole)", () => {
    expect(() => parseSwaps(["c->c"])).toThrow(/unknown model 'c'/);
    expect(() => parseSwaps(["o->o"])).toThrow(/unknown model 'o'/);
  });

  test("rejects malformed input missing '->'", () => {
    expect(() => parseSwaps(["opus"])).toThrow(/expects 'from->to'/);
    expect(() => parseSwaps(["opus sonnet"])).toThrow(/expects 'from->to'/);
  });

  test("rejects half-empty pairs", () => {
    expect(() => parseSwaps(["opus->"])).toThrow(/expects 'from->to'/);
    expect(() => parseSwaps(["->sonnet"])).toThrow(/expects 'from->to'/);
  });

  test("CLI surfaces the validation error and exits 1", () => {
    const r = run(["whatif", "--swap", "xyz->abc"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unknown model 'xyz'/);
  });
});
