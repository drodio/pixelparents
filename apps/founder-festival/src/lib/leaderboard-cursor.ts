import type { LeaderboardCursor } from "./leaderboard";

// Opaque base64url-encoded JSON of the keyset position {score, id}. Opaque so
// clients treat it as a token, not a stable contract — we can change the
// internal shape later without breaking callers. Type-only import of the cursor
// type avoids a runtime cycle with leaderboard.ts.
export function encodeCursor(c: LeaderboardCursor): string {
  return Buffer.from(JSON.stringify({ s: c.score, i: c.id })).toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): LeaderboardCursor | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof obj?.s !== "number" || typeof obj?.i !== "string") return null;
    return { score: obj.s, id: obj.i };
  } catch {
    return null;
  }
}
