import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import RootProfilePage from "../page";
import { buildProfileMetadata } from "@/lib/profile-metadata";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Per-eval social card metadata for /profile/<clerk_username>. Without this,
// the username route falls through to the layout's generic Founder Festival
// card on social unfurls.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  if (handle === "founder" || handle === "investor") return {};
  const [row] = await db
    .select({ evaluationId: users.evaluationId })
    .from(users)
    .where(sql`lower(${users.clerkUsername}) = lower(${handle})`)
    .limit(1);
  if (!row?.evaluationId) return {};
  return buildProfileMetadata(row.evaluationId);
}

// Single-segment vanity URL: /profile/<clerk_username>
//
// Routing detail: Next.js requires ONE dynamic-segment name per level, so
// we share `[handle]` with the two-segment /profile/[handle]/[slug] route
// (the kind+slug name-slug URL). When the path is just /profile/founder
// (one segment), nothing should resolve — those are reserved for the
// two-segment name-slug URL where the second segment is the actual name.
// We 404 here in that case.
export default async function ProfileByUsername({ params, searchParams }: Props) {
  const { handle } = await params;
  if (handle === "founder" || handle === "investor") notFound();
  const sp = await searchParams;

  const [row] = await db
    .select({ evaluationId: users.evaluationId })
    .from(users)
    .where(sql`lower(${users.clerkUsername}) = lower(${handle})`)
    .limit(1);

  if (!row?.evaluationId) {
    notFound();
  }

  return RootProfilePage({
    searchParams: Promise.resolve({ ...sp, e: row.evaluationId, _canonical: "1" }),
  });
}
