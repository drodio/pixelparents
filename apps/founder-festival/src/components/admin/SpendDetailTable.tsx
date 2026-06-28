"use client";

import { LocalTime } from "@/components/LocalTime";
import { useSortable, SortHeader } from "@/components/admin/sortable";
import type { SortValue } from "@/lib/sort";

export type SpendRow = {
  id: string;
  fullName: string | null;
  model: string | null;
  llmCents: number | null;
  exaCents: number | null;
  totalCents: number | null;
  llmSource: string | null;
  createdAtIso: string;
};

// All cents are ×mult for the viewer (super-admins = 1). Sorting is on the raw
// numeric value so the order is independent of the multiplier.
const mul = (c: number | null, mult: number) => (c == null ? null : Math.round(c * mult));
const fmt = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);

const ACCESSORS: Record<string, (r: SpendRow) => SortValue> = {
  subject: (r) => (r.fullName ?? "").toLowerCase(),
  model: (r) => (r.model ?? "").toLowerCase(),
  llm: (r) => r.llmCents,
  exa: (r) => r.exaCents,
  total: (r) => r.totalCents,
  when: (r) => new Date(r.createdAtIso),
};

export function SpendDetailTable({ rows, costMult }: { rows: SpendRow[]; costMult: number }) {
  const { sorted, sort, toggle } = useSortable(rows, ACCESSORS, "when", "desc");

  if (rows.length === 0) {
    return (
      <p className="text-zinc-500 text-sm">
        No eval costs recorded yet. Run an eval, a re-score, or a bulk job and the real
        per-eval costs will show up here.
      </p>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-xs">
            <tr>
              <SortHeader label="Subject" colKey="subject" sort={sort} onToggle={toggle} />
              <SortHeader label="Model" colKey="model" sort={sort} onToggle={toggle} />
              <SortHeader label="LLM" colKey="llm" sort={sort} onToggle={toggle} align="right" defaultDir="desc" />
              <SortHeader label="Exa" colKey="exa" sort={sort} onToggle={toggle} align="right" defaultDir="desc" />
              <SortHeader label="Total" colKey="total" sort={sort} onToggle={toggle} align="right" defaultDir="desc" />
              <SortHeader label="When" colKey="when" sort={sort} onToggle={toggle} defaultDir="desc" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-t border-zinc-800 hover:bg-zinc-900">
                <td className="px-4 py-3">
                  <a
                    href={`/welcome?e=${r.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-zinc-300"
                  >
                    {r.fullName ?? <span className="text-zinc-500">unknown</span>}
                  </a>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{r.model ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                  {fmt(mul(r.llmCents, costMult))}
                  {r.llmSource === "estimated" && (
                    <span className="ml-1 text-[10px] text-amber-500" title="gateway cost missing; token estimate">
                      est
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{fmt(mul(r.exaCents, costMult))}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-100">{fmt(mul(r.totalCents, costMult))}</td>
                <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                  <LocalTime iso={r.createdAtIso} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
