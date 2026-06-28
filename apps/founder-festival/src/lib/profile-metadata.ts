import type { Metadata } from "next";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deriveEvalStatus } from "./eval-pipeline";

// Shared per-eval Open Graph / Twitter metadata builder. Used by:
//   - /profile/page.tsx (legacy ?e=<uuid> URLs)
//   - /profile/[handle]/page.tsx (username URLs like /profile/drodio)
//   - /profile/[handle]/[slug]/page.tsx (kind+slug URLs like /profile/founder/jane-doe)
//
// Each route resolves its URL to an evaluationId and calls this. Without it,
// slug-based URLs would fall through to the generic site card on social
// unfurls (the bug that prompted the social-card fix).
//
// Title format: "Founder Festival: <Full Name>'s Profile" — brand-forward,
// per DROdio's spec. The generated OG image (/api/og?e=<id>) is the score
// snapshot that does the heavy informational lifting.
//
// Low-signal evals still return {} (the site's default metadata). Sharing a
// low-signal profile is unusual; if it happens the generic card is fine.
export async function buildProfileMetadata(
  evaluationId: string,
): Promise<Metadata> {
  const [row] = await db
    .select({
      id: evaluations.id,
      fullName: evaluations.fullName,
      profile: evaluations.profile,
      score: evaluations.score,
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
    })
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  if (!row || deriveEvalStatus(row.score) === "low-signal") return {};

  const profileFullName = (row.profile as { fullName?: string } | null)?.fullName;
  const fullName =
    (row.fullName && row.fullName.trim()) ||
    (profileFullName && profileFullName.trim()) ||
    null;

  const title = fullName
    ? `Founder Festival: ${fullName}'s Profile`
    : `Founder Festival: Profile`;
  const isInvestor = row.investorScore > row.founderScore;
  const dimScore = isInvestor ? row.investorScore : row.founderScore;
  const label = isInvestor ? "InvestorScore" : "FounderScore";
  const description = fullName
    ? `${fullName}'s ${label} on Founder Festival: ${dimScore}.`
    : `Founder Festival ${label}: ${dimScore}.`;
  const ogImageUrl = `/api/og?e=${row.id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}
