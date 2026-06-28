import { redirect } from "next/navigation";
import { canonicalProfileUrl } from "@/lib/canonical-profile-url";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Legacy /welcome URL — kept around because the page lived there from early-
// 2026 through 2026-05-25 and external shares (LinkedIn posts, emails, OG
// image links, the claim callback's `return=welcome` value) still point at
// it. Now goes straight to the canonical vanity URL when one exists, so
// shared links upgrade to the clean path the first time anyone clicks them.
export default async function WelcomeRedirect({ searchParams }: PageProps) {
  const params = await searchParams;
  const evalId = typeof params.e === "string" ? params.e : null;
  // Preserve extras (claimed=, claim_failed=, etc.) on whichever URL we
  // redirect to.
  const extras = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "e" || v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => extras.append(k, x));
    else extras.append(k, v);
  }
  const tail = extras.toString();
  const suffix = tail ? `?${tail}` : "";

  if (evalId) {
    const canonical = await canonicalProfileUrl(evalId);
    if (canonical) redirect(`${canonical}${suffix}`);
  }
  // Fallback: legacy /profile?e=<uuid> form (works for un-slugged rows).
  redirect(`/profile${evalId ? `?e=${evalId}${suffix ? `&${tail}` : ""}` : suffix}`);
}
