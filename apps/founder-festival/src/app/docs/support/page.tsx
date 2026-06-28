import type { Metadata } from "next";
import Link from "next/link";
import { getViewerEvaluationId } from "@/lib/attendee";
import { listMyTickets, userTicketLabel, userTicketStatus } from "@/lib/support";
import { SupportTicketForm } from "@/components/docs/SupportTicketForm";

export const metadata: Metadata = {
  title: "Support — Founder Festival Docs",
  description: "Get help from the Founder Festival team.",
};

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const evaluationId = await getViewerEvaluationId();

  if (!evaluationId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-3xl font-bold text-white">Support</h1>
        <p className="text-zinc-400">
          Support tickets are available once you&apos;ve claimed your profile. Claiming verifies
          who you are so we can help you with your account, profile, and events.
        </p>
        <Link
          href="/claim"
          className="self-start rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-semibold text-black hover:bg-[#c98e2a]"
        >
          Claim your profile →
        </Link>
      </div>
    );
  }

  const tickets = await listMyTickets(evaluationId);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-bold text-white">Support</h1>
        <p className="text-zinc-400">
          Have a question or hit a snag? Send us a note and we&apos;ll get back to you by email
          and here in your ticket.
        </p>
        <SupportTicketForm />
      </div>

      {tickets.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold text-white">Your tickets</h2>
          <ul className="flex flex-col divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {tickets.map((t) => {
              const s = userTicketStatus(t.status, t.adminReplied);
              return (
                <li key={t.id}>
                  <Link
                    href={`/docs/support/${t.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0 truncate text-sm text-zinc-200">{t.subject}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                        s === "closed"
                          ? "border-zinc-700 bg-zinc-800 text-zinc-400"
                          : s === "pending"
                            ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                            : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      }`}
                    >
                      {userTicketLabel(t.status, t.adminReplied)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
