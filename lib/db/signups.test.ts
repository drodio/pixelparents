import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Social-proof count coverage.
//
// getSignupCount / getChildrenCount must count ONLY completed signups — the
// signup flow inserts a draft row (empty firstName/email) on first interaction,
// so a bare count(*) inflates the landing headline with every abandoner/bot.
// We can't hit a live DB in the unit suite, so we mock getDb() with a chainable
// recorder that captures the `.where()` predicate, then compile it to SQL with
// drizzle's PgDialect and assert it filters on the completion marker.
// ---------------------------------------------------------------------------

const whereClauses: unknown[] = [];

function makeQueryBuilder() {
  const qb: Record<string, unknown> = {};
  const chain = () => qb;
  qb.select = chain;
  qb.from = chain;
  qb.where = (clause: unknown) => {
    whereClauses.push(clause);
    return qb;
  };
  // The count queries `await` the builder (it's thenable) and read row[0].c.
  (qb as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve([{ c: 7 }]);
  return qb;
}

vi.mock("@/lib/db", () => ({
  getDb: () => makeQueryBuilder(),
  getSql: () => {
    throw new Error("getSql not used by the count paths under test");
  },
}));
vi.mock("@/lib/db/ensure", () => ({
  ensureFamiliesSchema: () => Promise.resolve(),
  ensureDirectoryIndex: () => Promise.resolve(),
}));

import {
  getSignupCount,
  getChildrenCount,
  getStudentBuilderCount,
  COMPLETED_SIGNUP_SQL,
} from "@/lib/db/signups";
import { OHS_AFFILIATIONS } from "@/lib/options";

const dialect = new PgDialect();
const compile = (frag: unknown) => dialect.sqlToQuery(frag as never).sql;

beforeEach(() => {
  whereClauses.length = 0;
});

describe("COMPLETED_SIGNUP_SQL", () => {
  it("filters on the same completion marker completeSignup stamps (extra.notified='true')", () => {
    const compiled = compile(COMPLETED_SIGNUP_SQL);
    expect(compiled).toContain("->>'notified'");
    expect(compiled).toContain("'true'");
  });
});

describe("getSignupCount", () => {
  it("counts only completed signups (excludes drafts)", async () => {
    const c = await getSignupCount();
    expect(c).toBe(7);
    expect(whereClauses).toHaveLength(1);
    expect(compile(whereClauses[0])).toContain("->>'notified'");
  });
});

describe("getChildrenCount", () => {
  it("counts only children whose family has a completed parent", async () => {
    const c = await getChildrenCount();
    expect(c).toBe(7);
    expect(whereClauses).toHaveLength(1);
    const compiled = compile(whereClauses[0]);
    // Correlated EXISTS against signups on family_id, gated on completion.
    expect(compiled).toMatch(/exists/i);
    expect(compiled).toContain("->>'notified'");
    expect(compiled).toContain("family_id");
  });
});

// getStudentBuilderCount runs raw SQL via getSql(), which our mock makes throw —
// so here we only lock in the affiliation-string contract (kept in lockstep with
// the canonical OHS_AFFILIATIONS list it slices for its filter).
describe("student affiliations (lockstep with options)", () => {
  it("OHS_AFFILIATIONS exposes the two student affiliations the count filters on", () => {
    expect(OHS_AFFILIATIONS[3]).toBe(
      "Current OHS student (I'm currently enrolled at OHS)",
    );
    expect(OHS_AFFILIATIONS[4]).toBe("Alumni student (I graduated from OHS)");
  });

  it("getStudentBuilderCount is exported (uses raw getSql, DB-bound)", () => {
    expect(typeof getStudentBuilderCount).toBe("function");
  });
});

// Sanity: the marker string in the shared predicate matches what a JS reader of
// a completed row's `extra` would see (extra.notified === true → '->>' yields
// the text 'true'). Guards against drift between completeSignup and the counts.
describe("completion marker string", () => {
  it("uses the literal 'notified' key and 'true' value", () => {
    const compiled = compile(sql`${COMPLETED_SIGNUP_SQL}`);
    expect(compiled).toContain("'notified'");
    expect(compiled).toContain("'true'");
  });
});
