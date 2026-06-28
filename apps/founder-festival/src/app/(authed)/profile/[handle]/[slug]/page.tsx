import { db } from "@/db";
import { evaluations, profileSlugAliases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import RootProfilePage from "../../page";
import { buildProfileMetadata } from "@/lib/profile-metadata";

type Props = {
  params: Promise<{ handle: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Per-eval social card metadata for /profile/<kind>/<slug>. Resolves the
// eval by slug — including the alias fallback so a shared URL whose slug
// was later renamed still gets the personalized card.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle: kind, slug } = await params;
  if (kind !== "founder" && kind !== "investor") return {};
  const [row] = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(eq(evaluations.slug, slug))
    .limit(1);
  if (row) return buildProfileMetadata(row.id);
  // Historical-slug fallback: pre-rename URLs still get the personalized card
  // via the alias table.
  const [alias] = await db
    .select({ evaluationId: profileSlugAliases.evaluationId })
    .from(profileSlugAliases)
    .where(eq(profileSlugAliases.aliasSlug, slug))
    .limit(1);
  if (alias?.evaluationId) return buildProfileMetadata(alias.evaluationId);
  return {};
}

// Two-segment vanity URL: /profile/<kind>/<slug>
//
// `handle` is the role ("founder" or "investor"). Both roles always
// resolve for any slug:
//   - If the URL's role matches the profile's canonical slug_kind: serve.
//   - If the URL's role is the non-canonical one: 301-redirect to the
//     canonical URL (so we have one canonical URL per profile for SEO).
//   - If the slug isn't an active evaluation slug, try profile_slug_aliases.
//     A hit redirects to the profile's current canonical URL.
//
// Anything else 404s. Usernames take the single-segment /profile/[handle] route.
export default async function ProfileByKindSlug({ params, searchParams }: Props) {
  const { handle: kind, slug } = await params;
  if (kind !== "founder" && kind !== "investor") notFound();
  const sp = await searchParams;

  // Active slug lookup is global (uniqueness is no longer per-role).
  const [row] = await db
    .select({
      id: evaluations.id,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
    })
    .from(evaluations)
    .where(eq(evaluations.slug, slug))
    .limit(1);

  if (row) {
    if (row.slugKind && row.slugKind !== kind) {
      // Non-canonical role URL — redirect to the canonical one. 308 (the
      // Next default for permanent redirects) preserves the request method.
      redirect(`/profile/${row.slugKind}/${row.slug}`);
    }
    return RootProfilePage({
      searchParams: Promise.resolve({ ...sp, e: row.id, _canonical: "1" }),
    });
  }

  // Historical-slug fallback: someone changed their slug, this is the old
  // one. Look up the eval and redirect to its current canonical URL.
  const [alias] = await db
    .select({ evaluationId: profileSlugAliases.evaluationId })
    .from(profileSlugAliases)
    .where(eq(profileSlugAliases.aliasSlug, slug))
    .limit(1);

  if (alias) {
    const [target] = await db
      .select({ slug: evaluations.slug, slugKind: evaluations.slugKind })
      .from(evaluations)
      .where(eq(evaluations.id, alias.evaluationId))
      .limit(1);
    if (target && target.slug && target.slugKind) {
      redirect(`/profile/${target.slugKind}/${target.slug}`);
    }
  }

  notFound();
}
