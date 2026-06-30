// "Builder" status — a parent who has shipped commits to the Pixel Parents repo.
// ALL state lives in signups.extra (no new DB columns — a stray `country` column
// once caused a prod P0), under these keys:
//   extra.builder              bool  — auto-set true once a commit check finds >0
//   extra.builderManual        bool  — an explicit manual override (admin/family)
//   extra.githubContributions  int   — commit count from the last check
//   extra.githubCheckedAt      iso   — when the last commit check ran
//
// Effective builder = builderManual === true || builder === true. The manual flag
// lets a family mark someone a builder without (or before) a successful commit
// check; the auto flag is set by refreshBuilderStatus when commits are found.

export type BuilderStatus = {
  isBuilder: boolean;
  contributions: number;
};

// Pure projection of a signup's `extra` jsonb into its builder status. Safe to
// call anywhere (server components, the directory card builder, tests) — it never
// touches the DB or the network and tolerates missing/garbage values.
export function builderStatusOf(
  extra: Record<string, unknown> | null | undefined,
): BuilderStatus {
  const e = extra ?? {};
  const isBuilder = e.builderManual === true || e.builder === true;
  const raw = e.githubContributions;
  // Coerce only finite, non-negative integers; anything else → 0.
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  return { isBuilder, contributions: n };
}
