"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { abbrState } from "@/lib/options";
import { setAdmin } from "./actions";
import { Pills } from "./pills";
import { TableWrap, thCls, tdCls } from "./ui";
import { PencilIcon } from "./icons";
import { DeleteButton } from "./delete-button";
import { compare, SortHeader, type Dir } from "./sortable";
import { PhotoGallery, type GalleryPhoto } from "./photo-gallery";

export type ParentRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  githubUsername: string;
  ohsAffiliation: string | null;
  technicalDepth: string | null;
  timeCommitment: string | null;
  skillsets: string[] | null;
  city: string | null;
  state: string | null;
  parentInterests: string[] | null;
  photoCount: number;
  photos: GalleryPhoto[];
  dbAdmin: boolean;
  envAdmin: boolean;
  kids: { id: string; firstName: string; grade: string | null }[];
  submittedLabel: string;
  createdAtMs: number;
};

function shortAffiliation(s: string | null): string | null {
  return s ? s.split(" (")[0] : null;
}

export function ParentsTable({ rows }: { rows: ParentRow[] }) {
  const [sortKey, setSortKey] = useState("submitted");
  const [dir, setDir] = useState<Dir>("desc");
  const onSort = (k: string) => {
    if (k === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(k);
      setDir("asc");
    }
  };

  function val(r: ParentRow, k: string): string | number | null {
    switch (k) {
      case "status": return r.envAdmin ? 2 : r.dbAdmin ? 1 : 0;
      case "name": return `${r.firstName} ${r.lastName}`.toLowerCase();
      case "children": return r.kids.length;
      case "contact": return r.email.toLowerCase();
      case "github": return r.githubUsername.toLowerCase();
      case "affiliation": return shortAffiliation(r.ohsAffiliation);
      case "tech": return r.technicalDepth;
      case "time": return r.timeCommitment;
      case "skillsets": return r.skillsets?.length ?? 0;
      case "location": return [r.city, r.state].filter(Boolean).join(", ").toLowerCase() || null;
      case "interests": return r.parentInterests?.length ?? 0;
      case "photos": return r.photoCount;
      case "submitted": return r.createdAtMs;
      default: return null;
    }
  }

  const sorted = useMemo(
    () => [...rows].sort((a, b) => compare(val(a, sortKey), val(b, sortKey), dir)),
    [rows, sortKey, dir],
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const togglePhotos = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hp = { sortKey, dir, onSort, className: thCls };

  return (
    <TableWrap>
      <thead>
        <tr>
          <SortHeader label="Status" k="status" {...hp} />
          <SortHeader label="Name" k="name" {...hp} />
          <SortHeader label="Children" k="children" {...hp} />
          <SortHeader label="Contact" k="contact" {...hp} />
          <SortHeader label="GitHub" k="github" {...hp} />
          <SortHeader label="Affiliation" k="affiliation" {...hp} />
          <SortHeader label="Tech depth" k="tech" {...hp} />
          <SortHeader label="Time" k="time" {...hp} />
          <SortHeader label="Skillsets" k="skillsets" {...hp} />
          <SortHeader label="Location" k="location" {...hp} />
          <SortHeader label="Parent interests" k="interests" {...hp} />
          <SortHeader label="Photos" k="photos" {...hp} />
          <th className={thCls}>Actions</th>
          <SortHeader label="Submitted" k="submitted" {...hp} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <Fragment key={r.id}>
          <tr
            id={`p-${r.id}`}
            className="border-t border-white/10 odd:bg-white/[0.02] hover:bg-white/[0.05] target:bg-emerald-500/10"
          >
            <td className={`${tdCls} whitespace-nowrap`}>
              {r.envAdmin ? (
                <span className="rounded-md bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                  Superadmin
                </span>
              ) : (
                <form action={setAdmin}>
                  <input type="hidden" name="email" value={r.email} />
                  <input type="hidden" name="make" value={r.dbAdmin ? "false" : "true"} />
                  <button
                    type="submit"
                    title="Click to toggle Admin / User"
                    className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                      r.dbAdmin
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                        : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {r.dbAdmin ? "Admin" : "User"}
                  </button>
                </form>
              )}
            </td>
            <th scope="row" className={`${tdCls} whitespace-nowrap text-left font-bold text-white`}>
              {r.firstName} {r.lastName}
            </th>
            <td className={tdCls}>
              {r.kids.length === 0 ? (
                <span className="text-white/30">—</span>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {r.kids.map((k) => (
                    <Link
                      key={k.id}
                      href={`/admin/children?parent=${r.id}#c-${k.id}`}
                      className="whitespace-nowrap font-bold text-amber-400 hover:underline"
                    >
                      {k.firstName}
                      {k.grade ? <span className="font-normal text-white/50"> ({k.grade})</span> : null}
                    </Link>
                  ))}
                </div>
              )}
            </td>
            <td className={tdCls}>
              <a className="text-amber-400 hover:underline" href={`mailto:${r.email}`}>
                {r.email}
              </a>
              <div className="text-white/50">{r.phone}</div>
            </td>
            <td className={`${tdCls} whitespace-nowrap`}>
              <a
                className="text-amber-400 hover:underline"
                href={`https://github.com/${r.githubUsername}`}
                target="_blank"
                rel="noreferrer"
              >
                @{r.githubUsername}
              </a>
            </td>
            <td className={tdCls}>
              <Pills values={r.ohsAffiliation ? [shortAffiliation(r.ohsAffiliation)!] : null} />
            </td>
            <td className={`${tdCls} text-white/80`}>{r.technicalDepth ?? "—"}</td>
            <td className={`${tdCls} whitespace-nowrap text-white/80`}>{r.timeCommitment ?? "—"}</td>
            <td className={tdCls}>
              <Pills values={r.skillsets} />
            </td>
            <td className={`${tdCls} whitespace-nowrap text-white/80`}>
              {[r.city, abbrState(r.state)].filter(Boolean).join(", ") || "—"}
            </td>
            <td className={tdCls}>
              <Pills values={r.parentInterests} />
            </td>
            <td className={`${tdCls} whitespace-nowrap`}>
              {r.photos.length ? (
                <button
                  type="button"
                  onClick={() => togglePhotos(r.id)}
                  className="text-amber-400 hover:underline"
                >
                  {r.photos.length} photo{r.photos.length === 1 ? "" : "s"}
                  <span className="ml-1 text-white/40">{expanded.has(r.id) ? "▲" : "▼"}</span>
                </button>
              ) : (
                <span className="text-white/50">—</span>
              )}
            </td>
            <td className={`${tdCls} whitespace-nowrap`}>
              <div className="flex items-center gap-1">
                <Link
                  href={`/admin/parents/${r.id}/edit`}
                  title="Edit"
                  className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <PencilIcon />
                </Link>
                <DeleteButton id={r.id} name={`${r.firstName} ${r.lastName}`} />
              </div>
            </td>
            <td className={`${tdCls} whitespace-nowrap text-white/50`}>{r.submittedLabel}</td>
          </tr>
          {expanded.has(r.id) && r.photos.length > 0 && (
            <tr className="border-t border-white/10 bg-black/40">
              <td colSpan={14} className="px-4 py-4">
                <PhotoGallery photos={r.photos} />
              </td>
            </tr>
          )}
          </Fragment>
        ))}
      </tbody>
    </TableWrap>
  );
}
