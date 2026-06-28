import type { Metadata } from "next";
import { DocPageServer } from "@/components/docs/DocPageServer";

export const metadata: Metadata = {
  title: "Docs — Founder Festival",
  description: "How to use Founder Festival: profiles, the leaderboard, your account, and events.",
};

export const dynamic = "force-dynamic";

// /docs index = the Quickstart page.
export default function DocsIndexPage() {
  return <DocPageServer slug="quickstart" />;
}
