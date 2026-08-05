import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-level coverage check for the moderation guard.
//
// Why a test that reads source instead of calling code: the failure this catches
// is not a wrong RESULT, it's a MISSING CALL. PR #202 declared an edit guard and
// landed it inside createAskAction instead of updateAskAction — so create ran the
// guard twice and editing a post skipped it entirely. Everything still compiled,
// every unit test still passed, and the bypass was invisible until someone read
// the file. A behavioural test can't see a call site that was never written; it
// would need one case per action, which is the very list people forget to extend.
//
// So this asserts the property that actually matters: every member-facing action
// that writes text a member can read must consult guardWrite. When someone adds a
// new one, this fails and names it.

const FILES = [
  "app/(authed)/community/actions.ts",
  "app/(authed)/resources/actions.ts",
  "app/(authed)/events/actions.ts",
];

// Actions that create or edit member-visible text.
const WRITES = /^export async function ((?:create|update|add|respondTo)\w*Action)/;

// Writes with no member-authored free text: nothing to filter, and they carry no
// posting semantics a mute should block.
const EXEMPT = new Set([
  "addEventAdminAction", // takes a member id, no prose
]);

function actionBodies(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = src.split("\n");
  const starts: { name: string; line: number }[] = [];
  lines.forEach((l, i) => {
    const m = l.match(/^export async function (\w+)/);
    if (m) starts.push({ name: m[1], line: i });
  });
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].line : lines.length;
    out.set(s.name, lines.slice(s.line, end).join("\n"));
  });
  return out;
}

describe("guardWrite coverage", () => {
  const found: string[] = [];

  for (const rel of FILES) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    const bodies = actionBodies(src);

    for (const [name, body] of bodies) {
      if (!WRITES.test(`export async function ${name}`)) continue;
      if (EXEMPT.has(name)) continue;
      found.push(name);

      it(`${rel} → ${name} consults guardWrite`, () => {
        expect(body).toContain("guardWrite(");
      });

      it(`${rel} → ${name} consults it exactly once`, () => {
        // A second call is dead weight and a strong hint the guard was pasted
        // into the wrong function — which is precisely how #202 went wrong.
        expect(body.match(/guardWrite\(/g)?.length ?? 0).toBe(1);
      });
    }
  }

  it("actually inspected the write actions (regex still matches reality)", () => {
    // Without this, a rename to a naming scheme WRITES doesn't match would make
    // every assertion above silently vanish and the suite would still be green.
    expect(found.length).toBeGreaterThanOrEqual(8);
  });
});
