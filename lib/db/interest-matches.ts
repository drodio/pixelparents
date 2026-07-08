import { getDb } from "@/lib/db";
import { ensureFamiliesSchema, ensureDirectoryIndex } from "@/lib/db/ensure";
import { children, type ChildRow, type SignupRow } from "@/lib/db/schema/signups";
import { isStudentAccount } from "@/lib/family-display";
import { buildDirectoryCard, isDirectoryVisible } from "@/lib/directory";
import { getDirectorySignups } from "@/lib/db/signups";
import { rankInterestMatches, type InterestMatch } from "@/lib/interest-matching";

// DB↔matcher adapter for the "Families who share your interests" auto-matching
// surface (dashboard). Thin DB access: self-heal the schema first (the
// country-column P0 lesson — new tables/columns must be self-healed AND every read
// path must call the ensure fn), load the SAME directory-visible population the
// directory grid shows, project each into interests via buildDirectoryCard, and
// defer ALL ranking to the pure rankInterestMatches().
//
// PRIVACY — this reuses the directory's EXACT gates, so it can never leak a profile
// the directory wouldn't show:
//   • Candidates are the isDirectoryVisible() set (opt-in share + verified +
//     non-student-card), the same single-source-of-truth gate /directory and /p
//     use.
//   • Interests come from buildDirectoryCard(...).interests — already opt-in gated
//     (the "interests" share field) and student-coarsened upstream, so we never
//     match on a raw interest a family didn't choose to share.
//   • Names/tokens come straight from the card (students = first name only; token
//     is the /directory/<token> link the card already exposes).
//   • The viewer's OWN family (every co-parent sharing their family_id) is excluded
//     so a family is never suggested to itself.

export type SharedInterestMatch = InterestMatch;

// Group children by family for buildDirectoryCard.
function groupKidsByFamily(kids: ChildRow[]): Map<string, ChildRow[]> {
  const byFamily = new Map<string, ChildRow[]>();
  for (const k of kids) {
    const arr = byFamily.get(k.familyId);
    if (arr) arr.push(k);
    else byFamily.set(k.familyId, [k]);
  }
  return byFamily;
}

// Group STUDENT accounts by family (used to resolve a rendered child to its own
// student account so the card shows the accurate aggregated interest set), built
// from ALL rows — a student account need not earn its own card to enrich a parent's.
function groupStudentsByFamily(rows: SignupRow[]): Map<string, SignupRow[]> {
  const byFamily = new Map<string, SignupRow[]>();
  for (const r of rows) {
    if (!isStudentAccount(r)) continue;
    const arr = byFamily.get(r.familyId);
    if (arr) arr.push(r);
    else byFamily.set(r.familyId, [r]);
  }
  return byFamily;
}

// The interests to MATCH the viewer on: exactly what the viewer's directory card
// would show (opt-in gated + student-coarsened). Returns [] when the viewer shares
// no interests / has no shareable interests — the matcher then returns []. We build
// the card with an empty photo map (matching doesn't need photos).
export function viewerMatchInterests(
  viewer: SignupRow,
  viewerKids: ChildRow[],
  viewerFamilyStudents: SignupRow[],
  currentYear: number,
): string[] {
  const card = buildDirectoryCard(
    viewer,
    viewerKids,
    new Map(),
    0,
    currentYear,
    viewerFamilyStudents,
  );
  return card.interests;
}

// Families who share the viewer's interests, ranked by overlap count. Returns []
// when the viewer shares no interests or the DB is unavailable. Best-effort:
// degrades to [] on any error (the dashboard section simply won't render).
export async function getSharedInterestMatches(
  viewer: SignupRow,
  opts?: { limit?: number },
): Promise<SharedInterestMatch[]> {
  try {
    await Promise.all([ensureFamiliesSchema(), ensureDirectoryIndex()]);
    const db = getDb();

    const [allRows, kids] = await Promise.all([
      getDirectorySignups(),
      db.select().from(children).orderBy(children.createdAt),
    ]);

    const kidsByFamily = groupKidsByFamily(kids);
    const studentsByFamily = groupStudentsByFamily(allRows);
    const currentYear = new Date().getFullYear();

    // The viewer's own interests (coarsened, opt-in gated). If the viewer shares
    // none, there's nothing to match on. We resolve the viewer's family from the
    // loaded rows so we don't need a second query; fall back to the viewer alone.
    const viewerKids = kidsByFamily.get(viewer.familyId) ?? [];
    const viewerStudents = studentsByFamily.get(viewer.familyId) ?? [];
    const viewerInterests = viewerMatchInterests(
      viewer,
      viewerKids,
      viewerStudents,
      currentYear,
    );
    if (viewerInterests.length === 0) return [];

    // Candidates = the directory-visible set (same gate as the grid). Project each
    // into a FamilyInterestCandidate via buildDirectoryCard so interests/name/token
    // are the exact gated values the directory shows.
    const included = allRows.filter(isDirectoryVisible);
    const candidates = included.map((row) => {
      const card = buildDirectoryCard(
        row,
        kidsByFamily.get(row.familyId) ?? [],
        new Map(),
        0,
        currentYear,
        studentsByFamily.get(row.familyId) ?? [],
      );
      return {
        signupId: row.id,
        token: card.token, // directory-visible → a real share token
        name: card.name,
        isStudent: card.isStudent,
        interests: card.interests,
        signalCount: card.interests.length,
      };
    });

    // Exclude the viewer's WHOLE family (every co-parent sharing the family_id), so
    // a family is never suggested to itself.
    const excludeSignupIds = allRows
      .filter((r) => r.familyId && r.familyId === viewer.familyId)
      .map((r) => r.id);
    // Belt-and-suspenders: always exclude the viewer's own row id too.
    excludeSignupIds.push(viewer.id);

    return rankInterestMatches({
      viewerInterests,
      candidates,
      excludeSignupIds,
      limit: opts?.limit ?? 12,
    });
  } catch (err) {
    console.error("getSharedInterestMatches failed:", err);
    return [];
  }
}
