"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";
import { useSortable } from "@/components/admin/sortable";
import type { SortDir, SortValue } from "@/lib/sort";
import type { ClaimedProfileRow, ClaimedProfileDetail } from "@/lib/admin-claimed";

// Click-to-sort accessors, module-scoped for stable identity (so useSortable's
// memo doesn't churn). Strings sort case-insensitively; the claim date sorts as
// a real Date; empty cells always fall to the bottom (see sortRows).
const ACCESSORS: Record<string, (r: ClaimedProfileRow) => SortValue> = {
  name: (r) => r.name.toLowerCase(),
  email: (r) => r.email?.toLowerCase() ?? null,
  location: (r) => r.location?.toLowerCase() ?? null,
  claimed: (r) => (r.claimedAt ? new Date(r.claimedAt) : null),
  answers: (r) => r.answerCount,
  events: (r) => r.events.length,
  founder: (r) => r.founderScore,
  investor: (r) => r.investorScore,
  combined: (r) => r.combinedScore,
};

// Leaderboard-style roster of claimed profiles. Columns are click-to-sort (like
// the leaderboard); default sort is newest claim first. Rows WITH members-only
// data (family/pets, event answers, emails) expand in place to reveal it
// (fetched lazily, cached after first open); rows without it aren't expandable.
// The name links to the user's real public profile; event badges link to events.
export function ClaimedProfilesTable({ rows }: { rows: ClaimedProfileRow[] }) {
  const { sorted, sort, toggle: toggleSort } = useSortable(rows, ACCESSORS, "claimed", "desc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ClaimedProfileDetail | "loading" | "error">>({});

  const toggleOpen = useCallback(
    async (evalId: string) => {
      const next = openId === evalId ? null : evalId;
      setOpenId(next);
      if (next && !details[evalId]) {
        setDetails((d) => ({ ...d, [evalId]: "loading" }));
        try {
          const res = await fetch(`/api/admin/claimed/${evalId}`);
          if (!res.ok) throw new Error(String(res.status));
          const detail = (await res.json()) as ClaimedProfileDetail;
          setDetails((d) => ({ ...d, [evalId]: detail }));
        } catch {
          setDetails((d) => ({ ...d, [evalId]: "error" }));
        }
      }
    },
    [openId, details],
  );

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="w-8 px-3 py-2" />
            <Th label="Name" colKey="name" sort={sort} onToggle={toggleSort} />
            <Th label="Email" colKey="email" sort={sort} onToggle={toggleSort} />
            <Th label="Location" colKey="location" sort={sort} onToggle={toggleSort} />
            <Th label="Claimed" colKey="claimed" sort={sort} onToggle={toggleSort} defaultDir="desc" />
            <Th label="# Answers" colKey="answers" sort={sort} onToggle={toggleSort} align="right" defaultDir="desc" />
            <Th label="Events attended" colKey="events" sort={sort} onToggle={toggleSort} defaultDir="desc" />
            <Th label="Founder" colKey="founder" sort={sort} onToggle={toggleSort} align="right" defaultDir="desc" />
            <Th label="Investor" colKey="investor" sort={sort} onToggle={toggleSort} align="right" defaultDir="desc" />
            <Th label="Combined" colKey="combined" sort={sort} onToggle={toggleSort} align="right" defaultDir="desc" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <RowGroup
              key={r.evalId}
              row={r}
              rank={i + 1}
              open={openId === r.evalId}
              detail={details[r.evalId]}
              onToggle={() => toggleOpen(r.evalId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Sortable header cell matching this table's px-3 py-2 padding (the shared
// SortHeader uses px-4 py-3, which would misalign with the body cells).
function Th({
  label,
  colKey,
  sort,
  onToggle,
  align = "left",
  defaultDir = "asc",
}: {
  label: string;
  colKey: string;
  sort: { key: string; dir: SortDir };
  onToggle: (key: string, defaultDir?: SortDir) => void;
  align?: "left" | "right";
  defaultDir?: SortDir;
}) {
  const active = sort.key === colKey;
  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onToggle(colKey, defaultDir)}
        className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide transition-colors hover:text-white ${
          active ? "text-white" : "text-zinc-500"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        <span className="inline-block w-2 text-[9px]">{active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

function RowGroup({
  row,
  rank,
  open,
  detail,
  onToggle,
}: {
  row: ClaimedProfileRow;
  rank: number;
  open: boolean;
  detail: ClaimedProfileDetail | "loading" | "error" | undefined;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={`border-t border-zinc-800 ${open ? "bg-zinc-900/40" : "hover:bg-zinc-900/30"}`}>
        <td className="px-3 py-2 align-middle">
          {row.hasDetail ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-label={open ? "Collapse" : "Expand"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
            </button>
          ) : (
            <span className="block h-6 w-6" />
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-zinc-600">{rank}</span>
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
            ) : (
              <span className="h-7 w-7 shrink-0 rounded-md bg-zinc-800" />
            )}
            <Link
              href={row.profileHref}
              target="_blank"
              className="whitespace-nowrap font-medium text-white hover:underline"
            >
              {row.name}
              <ExternalLinkIcon className="ml-1 text-zinc-500" />
            </Link>
          </div>
        </td>
        <td className="px-3 py-2">
          {row.email ? (
            <a href={`mailto:${row.email}`} className="text-zinc-300 hover:underline">
              {row.email}
            </a>
          ) : (
            <span className="text-zinc-600">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-zinc-400">{row.location ?? "—"}</td>
        <td className="px-3 py-2 whitespace-nowrap text-zinc-400 tabular-nums">{fmtDate(row.claimedAt)}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {row.answerCount > 0 ? (
            <span className="text-zinc-200">{row.answerCount}</span>
          ) : (
            <span className="text-zinc-600">0</span>
          )}
        </td>
        <td className="px-3 py-2">
          {row.events.length === 0 ? (
            <span className="text-zinc-600">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.events.map((ev) => (
                <Link
                  key={ev.slug}
                  href={`/events/${ev.slug}`}
                  target="_blank"
                  title={ev.title}
                  className="max-w-[14rem] truncate rounded-md border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-white"
                >
                  {ev.title}
                </Link>
              ))}
            </div>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{row.founderScore}</td>
        <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{row.investorScore}</td>
        <td className="px-3 py-2 text-right font-semibold tabular-nums text-white">{row.combinedScore}</td>
      </tr>
      {open && row.hasDetail && (
        <tr className="border-t border-zinc-800/60 bg-zinc-950">
          <td />
          <td colSpan={9} className="px-3 py-4">
            <DetailBody detail={detail} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailBody({ detail }: { detail: ClaimedProfileDetail | "loading" | "error" | undefined }) {
  if (!detail || detail === "loading") return <p className="text-sm text-zinc-500">Loading details…</p>;
  if (detail === "error") return <p className="text-sm text-red-400">Couldn’t load details. Try again.</p>;

  const { family, eventAnswers, emails } = detail;
  const empty = family.length === 0 && eventAnswers.length === 0 && emails.length === 0;
  if (empty) return <p className="text-sm text-zinc-500 italic">No members-only data on this profile yet.</p>;

  return (
    <div className="flex flex-col gap-5">
      {family.length > 0 && (
        <Section title={`Family & Pets (${family.length})`}>
          <ul className="flex flex-col gap-1.5">
            {family.map((m, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="text-zinc-200">{m.label}</span>
                {m.interests.length > 0 && (
                  <span className="text-xs text-zinc-500">· {m.interests.join(", ")}</span>
                )}
                <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                  Visible to: {m.visibility}
                </span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] ${
                    m.publicBadge
                      ? "bg-purple-500/15 text-purple-200"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {m.publicBadge ? `Public badge: ${m.publicBadge}` : "Not shown publicly"}
                </span>
                {m.photoHref && (
                  <Link href={m.photoHref} target="_blank" className="text-[11px] text-sky-400 hover:underline">
                    photo
                    <ExternalLinkIcon className="ml-0.5" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {eventAnswers.length > 0 && (
        <Section title={`IRL Event Answers (${eventAnswers.length})`}>
          <ul className="flex flex-col gap-2">
            {eventAnswers.map((a, i) => (
              <li key={i} className="text-sm">
                <span className="text-zinc-200">{a.description}</span>
                <span className="ml-2 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">{a.score}</span>
                <span className="ml-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">{a.visibility}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {emails.length > 0 && (
        <Section title={`Emails (${emails.length})`}>
          <ul className="flex flex-wrap gap-2">
            {emails.map((e, i) => (
              <li key={i} className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                {e.email}
                <span className="ml-1 text-zinc-500">({e.status})</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}
