import { CreditsAndSpendView } from "@/components/admin/CreditsAndSpendView";

export const dynamic = "force-dynamic";

// "Credits & Spend" — one role-aware money view (also reachable at /admin/credits).
export default async function CreditsAndSpendPage({
  searchParams,
}: {
  searchParams: Promise<{ topup?: string; source?: string }>;
}) {
  return <CreditsAndSpendView search={await searchParams} />;
}
