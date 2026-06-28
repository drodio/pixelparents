"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import {
  abbrState,
  OHS_AFFILIATIONS,
  BUILDER_INTEREST,
  TECHNICAL_DEPTH,
  TIME_COMMITMENT,
  SKILLSETS,
  US_STATES,
} from "@/lib/options";
import { patchSignup, type SignupPatch } from "@/app/signup/actions";
import { setAdmin, setPhotoCaption, deleteSignup } from "./actions";
import { Pills } from "./pills";
import { TableWrap, thCls, tdCls } from "./ui";
import { NameCell } from "./name-cell";
import { TextCell, SelectCell, MultiSelectCell, TagsCell } from "./inline-edit";
import { compare, SortHeader, type Dir } from "./sortable";
import { PhotoGallery, type GalleryPhoto } from "./photo-gallery";
import { CopyIcon, CheckIcon } from "./icons";

// Copy every parent email (deduped, comma-delimited) to the clipboard. Lives next
// to the "Contact" header so admins can grab the whole list in one click.
function CopyEmailsButton({ emails }: { emails: string[] }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (emails.length === 0) return;
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — admin can still copy a cell manually */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy all ${emails.length} email addresses`}
      title={copied ? "Copied!" : `Copy all ${emails.length} email addresses`}
      className={`transition-colors ${copied ? "text-emerald-400" : "text-white/40 hover:text-amber-400"}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

export type ParentRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  githubUsername: string;
  ohsAffiliation: string | null;
  builderInterest: string | null;
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

function builderLabel(v: string | null): string {
  switch (v) {
    case "builder": return "Yes: Technical";
    case "aspiring": return "Yes: Curious";
    case "no": return "No";
    default: return "—";
  }
}

// Short label for a long affiliation, used in both the cell display and the
// inline <select> options.
const shortAffil = (s: string) => s.split(" (")[0];

export function ParentsTable({ rows }: { rows: ParentRow[] }) {
  const router = useRouter();
  // Persist one field then refresh so the table reflects the saved value.
  // patchSignup never throws — it returns { ok: false } on a bad UUID or DB
  // error — so throw here on failure to keep the inline editor open for retry.
  async function save(id: string, patch: SignupPatch) {
    const r = await patchSignup(id, patch);
    if (!r.ok) throw new Error("save failed");
    router.refresh();
  }

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
      case "builder": return builderLabel(r.builderInterest);
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

  // Deduped list of every parent email, for the Contact-header copy button.
  const allEmails = useMemo(
    () => Array.from(new Set(rows.map((r) => r.email).filter(Boolean))),
    [rows],
  );

  return (
    <TableWrap>
      <thead>
        <tr>
          <SortHeader label="Status" k="status" {...hp} />
          <SortHeader label="Name" k="name" {...hp} />
          <SortHeader label="Children" k="children" {...hp} />
          <SortHeader
            label="Contact"
            k="contact"
            {...hp}
            extra={<CopyEmailsButton emails={allEmails} />}
          />
          <SortHeader label="GitHub" k="github" {...hp} />
          <SortHeader label="Affiliation" k="affiliation" {...hp} />
          <SortHeader label="Builder?" k="builder" {...hp} />
          <SortHeader label="Tech depth" k="tech" {...hp} />
          <SortHeader label="Time" k="time" {...hp} />
          <SortHeader label="Skillsets" k="skillsets" {...hp} />
          <SortHeader label="Location" k="location" {...hp} />
          <SortHeader label="Parent interests" k="interests" {...hp} />
          <SortHeader label="Photos" k="photos" {...hp} />
          <SortHeader label="Submitted" k="submitted" {...hp} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <Fragment key={r.id}>
          <tr
            id={`p-${r.id}`}
            className="group border-t border-white/10 odd:bg-white/[0.02] hover:bg-white/[0.05] target:bg-emerald-500/10"
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
            <th scope="row" className={`${tdCls} whitespace-nowrap text-left`}>
              <NameCell
                firstName={r.firstName}
                lastName={r.lastName}
                editHref={`/admin/parents/${r.id}/edit`}
                deleteAction={deleteSignup}
                id={r.id}
                confirmMessage={`Delete ${r.firstName} ${r.lastName} and any associated children? This can't be undone.`}
                onSaveName={(firstName, lastName) => save(r.id, { firstName, lastName })}
              />
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
              <div className="flex flex-col gap-0.5">
                <TextCell
                  value={r.email}
                  label="Edit email"
                  placeholder="email"
                  type="email"
                  inputMode="email"
                  display={
                    <a className="text-amber-400 hover:underline" href={`mailto:${r.email}`}>
                      {r.email}
                    </a>
                  }
                  onSave={(email) => save(r.id, { email })}
                />
                <TextCell
                  value={r.phone}
                  label="Edit phone"
                  placeholder="phone"
                  type="tel"
                  inputMode="tel"
                  display={<span className="text-white/50">{r.phone || "—"}</span>}
                  onSave={(phone) => save(r.id, { phone })}
                />
              </div>
            </td>
            <td className={`${tdCls} whitespace-nowrap`}>
              <TextCell
                value={r.githubUsername}
                label="Edit GitHub username"
                prefix="github.com/"
                placeholder="username"
                display={
                  <a
                    className="text-amber-400 hover:underline"
                    href={`https://github.com/${r.githubUsername}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    @{r.githubUsername}
                  </a>
                }
                onSave={(githubUsername) => save(r.id, { githubUsername })}
              />
            </td>
            <td className={tdCls}>
              <SelectCell
                value={r.ohsAffiliation ?? ""}
                label="Edit affiliation"
                options={OHS_AFFILIATIONS}
                optionLabel={shortAffil}
                display={<Pills values={r.ohsAffiliation ? [shortAffiliation(r.ohsAffiliation)!] : null} />}
                onSave={(ohsAffiliation) => save(r.id, { ohsAffiliation })}
              />
            </td>
            <td className={`${tdCls} whitespace-nowrap text-white/80`}>
              <SelectCell
                value={r.builderInterest ?? ""}
                label="Edit builder interest"
                options={BUILDER_INTEREST}
                optionLabel={builderLabel}
                blankLabel="—"
                display={builderLabel(r.builderInterest)}
                onSave={(builderInterest) => save(r.id, { builderInterest })}
              />
            </td>
            <td className={`${tdCls} text-white/80`}>
              <SelectCell
                value={r.technicalDepth ?? ""}
                label="Edit tech depth"
                options={TECHNICAL_DEPTH}
                display={r.technicalDepth ?? "—"}
                onSave={(technicalDepth) => save(r.id, { technicalDepth })}
              />
            </td>
            <td className={`${tdCls} whitespace-nowrap text-white/80`}>
              <SelectCell
                value={r.timeCommitment ?? ""}
                label="Edit time commitment"
                options={TIME_COMMITMENT}
                display={r.timeCommitment ?? "—"}
                onSave={(timeCommitment) => save(r.id, { timeCommitment })}
              />
            </td>
            <td className={tdCls}>
              <MultiSelectCell
                value={r.skillsets ?? []}
                label="Edit skillsets"
                options={SKILLSETS}
                display={<Pills values={r.skillsets} />}
                onSave={(skillsets) => save(r.id, { skillsets })}
              />
            </td>
            <td className={`${tdCls} whitespace-nowrap text-white/80`}>
              <div className="flex flex-col gap-0.5">
                <TextCell
                  value={r.city ?? ""}
                  label="Edit city"
                  placeholder="city"
                  display={r.city ? r.city : <span className="text-white/30">—</span>}
                  onSave={(city) => save(r.id, { city })}
                />
                <SelectCell
                  value={r.state ?? ""}
                  label="Edit state"
                  options={US_STATES}
                  display={abbrState(r.state) ?? <span className="text-white/30">—</span>}
                  onSave={(state) => save(r.id, { state })}
                />
              </div>
            </td>
            <td className={tdCls}>
              <TagsCell
                value={r.parentInterests ?? []}
                label="Edit parent interests"
                display={<Pills values={r.parentInterests} />}
                onSave={(parentInterests) => save(r.id, { parentInterests })}
              />
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
            <td className={`${tdCls} whitespace-nowrap text-white/50`}>{r.submittedLabel}</td>
          </tr>
          {expanded.has(r.id) && r.photos.length > 0 && (
            <tr className="border-t border-white/10 bg-black/40">
              <td colSpan={14} className="px-4 py-4">
                <PhotoGallery
                  photos={r.photos}
                  candidates={[
                    { id: r.id, name: `${r.firstName} ${r.lastName}` },
                    ...r.kids.map((k) => ({ id: k.id, name: k.firstName })),
                  ]}
                  onSaveCaption={(pathname, caption) => setPhotoCaption(r.id, pathname, caption)}
                />
              </td>
            </tr>
          )}
          </Fragment>
        ))}
      </tbody>
    </TableWrap>
  );
}
