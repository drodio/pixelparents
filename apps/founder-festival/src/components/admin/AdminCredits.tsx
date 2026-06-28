"use client";

import { useEffect, useState } from "react";
import { LocalTime } from "@/components/LocalTime";
import { useSortable, SortHeader } from "@/components/admin/sortable";
import type { SortValue } from "@/lib/sort";

type Pack = { id: string; label: string; cents: number };
type LedgerRow = {
  deltaCents: number;
  reason: string;
  createdAt: string;
  evaluationId: string | null;
  subject: string | null;
};

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

const REASON_LABEL: Record<string, string> = {
  topup: "Added credits",
  score_debit: "Scored",
  find_email_debit: "Found email",
  refund: "Refund",
  stripe_refund: "Refund (Stripe)",
};

const LEDGER_ACCESSORS: Record<string, (r: LedgerRow) => SortValue> = {
  activity: (r) => (REASON_LABEL[r.reason] ?? r.reason).toLowerCase(),
  when: (r) => new Date(r.createdAt),
  amount: (r) => r.deltaCents,
};

// Regular-admin view of the "Credits & Spend" page: their own balance, total
// they've spent (charged), credit packs to buy, and their sortable activity
// ledger. No global revenue and no true-cost breakdown — that's super-admin only.
export function AdminCredits({
  balanceCents,
  spentCents,
  topup,
  packs,
}: {
  balanceCents: number;
  spentCents: number;
  topup: string | null;
  packs: Pack[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);

  useEffect(() => {
    fetch("/api/developers/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLedger(d.ledger))
      .catch(() => {});
  }, []);

  async function buy(packId: string) {
    setBusy(packId);
    setError(null);
    try {
      const res = await fetch("/api/admin/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || `Checkout failed (HTTP ${res.status})`);
        setBusy(null);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Network error — please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Credits &amp; Spend</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Prepaid credits fund your scoring. Buy a pack below; spend is deducted as you
          score.
        </p>
      </div>

      {topup === "success" && (
        <p className="rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-sm px-4 py-2">
          ✓ Credits added. Your new balance is shown below.
        </p>
      )}
      {topup === "cancel" && (
        <p className="rounded-md border border-zinc-700 bg-zinc-900 text-zinc-400 text-sm px-4 py-2">
          Checkout canceled — no charge was made.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-md border border-zinc-800 bg-zinc-950 p-5">
          <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Balance</div>
          <div className="text-4xl font-bold tabular-nums mt-1">{fmt(balanceCents)}</div>
          <div className="text-xs text-zinc-600 mt-1">credits remaining</div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-950 p-5">
          <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Total spent</div>
          <div className="text-4xl font-bold tabular-nums mt-1 text-[#dfa43a]">{fmt(spentCents)}</div>
          <div className="text-xs text-zinc-600 mt-1">charged to you for scoring</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Buy credits</div>
        <div className="flex flex-wrap gap-2">
          {packs.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy !== null}
              onClick={() => buy(p.id)}
              className="rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-5 py-2 text-sm transition-colors disabled:opacity-40"
            >
              {busy === p.id ? "…" : p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-600">
          Secure checkout via Stripe. Packs are real dollars; 1 credit = $0.01.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Activity</div>
        {ledger === null ? (
          <p className="text-sm text-zinc-600">Loading…</p>
        ) : ledger.length === 0 ? (
          <p className="text-sm text-zinc-600">No activity yet.</p>
        ) : (
          <LedgerTable rows={ledger} />
        )}
      </div>
    </div>
  );
}

function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  const { sorted, sort, toggle } = useSortable(rows, LEDGER_ACCESSORS, "when", "desc");
  return (
    <div className="border border-zinc-800 rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-xs">
            <tr>
              <SortHeader label="Activity" colKey="activity" sort={sort} onToggle={toggle} />
              <SortHeader label="When" colKey="when" sort={sort} onToggle={toggle} defaultDir="desc" />
              <SortHeader label="Amount" colKey="amount" sort={sort} onToggle={toggle} align="right" defaultDir="desc" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-900">
                <td className="px-4 py-2 text-zinc-300">
                  {REASON_LABEL[r.reason] ?? r.reason}
                  {r.subject && (
                    <span className="text-zinc-500">
                      {" "}
                      ·{" "}
                      {r.evaluationId ? (
                        <a
                          href={`/profile?e=${r.evaluationId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link"
                        >
                          {r.subject}
                        </a>
                      ) : (
                        r.subject
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-500 text-xs whitespace-nowrap tabular-nums">
                  <LocalTime iso={r.createdAt} />
                </td>
                <td
                  className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${
                    r.deltaCents >= 0 ? "text-emerald-400" : "text-zinc-300"
                  }`}
                >
                  {r.deltaCents >= 0 ? "+" : "−"}
                  {fmt(Math.abs(r.deltaCents))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
