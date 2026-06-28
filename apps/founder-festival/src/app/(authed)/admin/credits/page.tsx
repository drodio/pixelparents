import { CreditsAndSpendView } from "@/components/admin/CreditsAndSpendView";

export const dynamic = "force-dynamic";

// Alias of the consolidated "Credits & Spend" page (/admin/spend). Kept as a live
// route so existing deep links keep working — Stripe's success_url
// (/admin/credits?topup=success) and the `insufficient_credits` topupUrl.
export default async function AdminCreditsAliasPage({
  searchParams,
}: {
  searchParams: Promise<{ topup?: string; source?: string }>;
}) {
  return <CreditsAndSpendView search={await searchParams} />;
}
