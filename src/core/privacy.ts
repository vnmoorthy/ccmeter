// Path redaction and anonymization for safe sharing.
//
// redactPath:           keep tail (last 2 segments), replace user dirs with ~/<x>
// anonymizePath:        opaque hash, used in JSON exports
// anonymizeId:          short opaque hash for any id
// displayAnonymizePath: friendly readable label safe for screenshots / launch
//                       gifs. Looks like `~/projects/proj-a3b4c` so the table
//                       still reads as "a path" but reveals nothing.

import crypto from "node:crypto";
import os from "node:os";

export function redactPath(p: string): string {
  if (!p) return "";
  const home = os.homedir();
  let s = p;
  if (s.startsWith(home)) s = "~" + s.slice(home.length);
  // /Users/<name> or /home/<name> → ~ already covered, but if not us:
  s = s.replace(/^\/Users\/[^/]+/, "~");
  s = s.replace(/^\/home\/[^/]+/, "~");
  s = s.replace(/^[A-Z]:\\Users\\[^\\]+/i, "~");
  // collapse middle to <redacted> if path is long
  const parts = s.split(/[/\\]/).filter(Boolean);
  if (parts.length > 4) {
    const last2 = parts.slice(-2).join("/");
    return "~/<redacted>/" + last2;
  }
  return s;
}

export function anonymizePath(p: string): string {
  if (!p) return "";
  return "anon://" + sha8(p);
}

export function anonymizeId(id: string): string {
  return "id_" + sha8(id);
}

/** Friendly anonymized path for screenshots / launch gifs. Stable per input
 * (same project always renders the same label), short, looks path-shaped. */
export function displayAnonymizePath(p: string): string {
  if (!p) return "~/projects/<unknown>";
  return `~/projects/proj-${sha5(p)}`;
}

/** Short, friendly anonymized id (replaces session UUIDs in display). */
export function displayAnonymizeId(id: string): string {
  if (!id) return "sess-anon";
  return `sess-${sha5(id)}`;
}

function sha8(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);
}

function sha5(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 5);
}
