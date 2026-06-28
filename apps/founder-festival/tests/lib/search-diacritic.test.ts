import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { IS_PROD_DB } from "../setup";
import { asciiFoldForSearch, searchLeaderboard, parseLeaderboardFilter } from "@/lib/leaderboard";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe("asciiFoldForSearch", () => {
  it("folds Turkish dotless ı (and friends) to ASCII", () => {
    expect(asciiFoldForSearch("Yıldırım")).toBe("yildirim");
    expect(asciiFoldForSearch("Şükrü Güneş")).toBe("sukru gunes");
  });
  it("folds accented Latin and is a no-op on plain ASCII", () => {
    expect(asciiFoldForSearch("Renée")).toBe("renee");
    expect(asciiFoldForSearch("Smith")).toBe("smith");
  });
});

describe.skipIf(IS_PROD_DB)("searchLeaderboard diacritic-insensitivity", () => {
  it("finds an ASCII-stored profile from a Turkish-character query (the Ebru case)", async () => {
    const slugSuffix = rnd();
    const [ev] = await db
      .insert(evaluations)
      .values({
        linkedinUrl: `https://linkedin.com/in/ebru-yildirim-${slugSuffix}`,
        fullName: "Ebru Yildirim", // ASCII, as stored at score time
        slug: `ebru-yildirim-${slugSuffix}`,
        slugKind: "founder",
        score: 120,
        founderScore: 120,
        investorScore: 0,
        signalQuality: "high",
        source: "url",
      })
      .returning();

    try {
      // Query uses the Turkish name exactly as it comes from Luma, PLUS the unique
      // slug suffix. The suffix scopes the result to the row we just inserted —
      // searchLeaderboard orders tied scores by random UUID and caps at LIMIT 100,
      // and the (persistent) test branch accumulates same-named "Ebru Yildirim"
      // rows across CI runs, so without scoping ours can fall outside the top 100
      // at random (the historical flake). The Turkish "Yıldırım" must still
      // ASCII-fold to match the stored "yildirim" (AND-ed with the suffix), which
      // is exactly what this test guards.
      const rows = await searchLeaderboard(
        parseLeaderboardFilter(new URLSearchParams()),
        `Ebru Yıldırım ${slugSuffix}`,
      );
      expect(rows.some((r) => r.id === ev.id)).toBe(true);
    } finally {
      // Clean up so the test branch doesn't keep growing run-over-run.
      await db.delete(evaluations).where(eq(evaluations.id, ev.id));
    }
  });
});
