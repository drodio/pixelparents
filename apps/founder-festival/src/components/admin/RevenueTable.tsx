"use client";

import { useSortable, SortHeader } from "@/components/admin/sortable";
import type { SortValue } from "@/lib/sort";

// Local row shape (kept independent of the server module so this client bundle
// never imports anything that pulls in @/db — see the client-DB-import gotcha).
export type RevenueRow = {
  clerkUserId: string;
  label: string;
  kind: "admin" | "api" | "user";
  purchasedNetCents: number;
  refundedCents: number;
  remainingCents: number;
};

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

const KIND_LABEL: Record<RevenueRow["kind"], string> = {
  admin: "Admin",
  api: "API",
  user: "User",
};

const ACCESSORS: Record<string, (r: RevenueRow) => SortValue> = {
  user: (r) => r.label.toLowerCase(),
  purchased: (r) => r.purchasedNetCents,
  refunded: (r) => r.refundedCents,
  remaining: (r) => r.remainingCents,
};

export function RevenueTable({ rows, hasRefunds }: { rows: RevenueRow[]; hasRefunds: boolean }) {
  const { sorted, sort, toggle } = useSortable(rows, ACCESSORS, "purchased", "desc");

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No credit purchases yet.</p>;
  }

  return (
    <div className="border border-zinc-800 rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-xs">
            <tr>
              <SortHeader label="User" colKey="user" sort={sort} onToggle={toggle} />
              <SortHeader label="Purchased" colKey="purchased" sort={sort} onToggle={toggle} align="right" defaultDir="desc" />
              {hasRefunds && (
                <SortHeader label="Refunded" colKey="refunded" sort={sort} onToggle={toggle} align="right" defaultDir="desc" />
              )}
              <SortHeader label="Remaining" colKey="remaining" sort={sort} onToggle={toggle} align="right" defaultDir="desc" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.clerkUserId} className="border-t border-zinc-800 hover:bg-zinc-900">
                <td className="px-4 py-3">
                  <span className="text-zinc-200">{r.label}</span>
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-zinc-500">
                    {KIND_LABEL[r.kind]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-100">{fmt(r.purchasedNetCents)}</td>
                {hasRefunds && (
                  <td className="px-4 py-3 text-right tabular-nums text-amber-400">
                    {r.refundedCents > 0 ? `(${fmt(r.refundedCents)})` : "—"}
                  </td>
                )}
                <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{fmt(r.remainingCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
