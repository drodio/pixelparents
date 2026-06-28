"use client";

import { useEffect, useRef, useState } from "react";
import {
  RELATIONSHIP_OPTIONS,
  publicShareOptions,
  type FamilyMemberDTO,
  type PublicShare,
  type Visibility,
} from "@/lib/family-constants";
import { resizeImageForWeb } from "@/lib/resize-image";

type Viewer = { evaluationId: string; name: string };

// Add/Edit modal for one family member. Saves the JSON fields first (POST or
// PATCH), then uploads a newly-selected photo to the per-member photo route
// (which needs the id). Calls onSaved() to let the section refresh.
export function FamilyMemberForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: FamilyMemberDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;
  const [relationship, setRelationship] = useState(initial?.relationship ?? "daughter");
  const [relationshipOther, setRelationshipOther] = useState(initial?.relationshipOther ?? "");
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [birthdate, setBirthdate] = useState(initial?.birthdate ?? "");
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [interestDraft, setInterestDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initial?.photoHref ?? null);
  const [dragOver, setDragOver] = useState(false);
  // If the member is created but the photo upload then fails, remember the new id
  // so a retry PATCHes it instead of creating a duplicate member.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  function applyPhoto(f: File | null) {
    if (f && !f.type.startsWith("image/")) return;
    setPhotoFile(f);
    if (f) setPhotoPreview(URL.createObjectURL(f));
  }
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "specific");
  const [publicShare, setPublicShare] = useState<PublicShare>(initial?.publicShare ?? "none");
  const [viewers, setViewers] = useState<Viewer[]>(initial?.viewers ?? []);
  const [viewerQuery, setViewerQuery] = useState("");
  const [viewerResults, setViewerResults] = useState<Viewer[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Interest suggestion pool (global).
  useEffect(() => {
    void fetch("/api/account/family/interests")
      .then((r) => r.json())
      .then((d) => setSuggestions(Array.isArray(d.interests) ? d.interests : []))
      .catch(() => {});
  }, []);

  // Debounced viewer name search (only while picking "specific users").
  const searchGen = useRef(0);
  useEffect(() => {
    const q = viewerQuery.trim();
    // Don't reset state in the effect body (lint: set-state-in-effect); stale
    // results are simply hidden at render when the query is too short.
    if (visibility !== "specific" || q.length < 2) return;
    const myGen = ++searchGen.current;
    const t = setTimeout(() => {
      void fetch(`/api/account/family/user-search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => {
          if (searchGen.current === myGen) setViewerResults(Array.isArray(d.users) ? d.users : []);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [viewerQuery, visibility]);

  function addInterest(raw: string) {
    const t = raw.trim();
    if (!t) return;
    if (!interests.some((i) => i.toLowerCase() === t.toLowerCase())) {
      setInterests((prev) => [...prev, t]);
    }
    setInterestDraft("");
  }

  function addViewer(v: Viewer) {
    if (!viewers.some((x) => x.evaluationId === v.evaluationId)) setViewers((p) => [...p, v]);
    setViewerQuery("");
    setViewerResults([]);
  }

  // Public-profile disclosure options depend on relationship + birthdate. If the
  // chosen option no longer applies (e.g. age picked, then birthdate cleared),
  // fall back to "none" so we never save/show an inapplicable badge.
  const shareOptions = publicShareOptions(relationship, relationshipOther, birthdate || null);
  const selectedShare: PublicShare = shareOptions.some((o) => o.value === publicShare)
    ? publicShare
    : "none";

  async function save() {
    if (!firstName.trim()) {
      setErr("First name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    const payload = {
      relationship,
      relationshipOther: relationship === "other" ? relationshipOther : null,
      firstName,
      lastName,
      birthdate: birthdate || null,
      interests,
      visibility,
      publicShare: selectedShare,
      viewerEvalIds: visibility === "specific" ? viewers.map((v) => v.evaluationId) : [],
    };
    try {
      // Reuse the existing row on retry (edit OR a just-created member whose photo
      // upload failed) so we never create a duplicate.
      const existingId = isEdit ? initial!.id : createdId;
      const res = await fetch(
        existingId ? `/api/account/family/${existingId}` : "/api/account/family",
        {
          method: existingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? `Save failed (${res.status})`);
        setSaving(false);
        return;
      }
      const id = existingId ?? data.id;
      if (!existingId && id) setCreatedId(id);
      // Upload a newly-selected photo after the row exists. Downscale to a web
      // size in the browser first so it never trips the ~4.5MB function-body
      // limit (a full phone photo otherwise 413s and silently never saved).
      if (photoFile && id) {
        const web = await resizeImageForWeb(photoFile);
        const fd = new FormData();
        fd.append("file", web);
        const pres = await fetch(`/api/account/family/${id}/photo`, { method: "POST", body: fd });
        if (!pres.ok) {
          const pj = await pres.json().catch(() => ({}));
          setErr(`Saved, but the photo didn't upload (${pj.error ?? pres.status}). Try again or use a smaller image.`);
          setSaving(false);
          return;
        }
      }
      onSaved();
    } catch {
      setErr("Save failed. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-[#1b1b1b] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-zinc-100">
            {isEdit ? "Edit family member" : "Add family member"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-zinc-100 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 text-sm">
          {/* Relationship */}
          <label className="flex flex-col gap-1">
            <span className="text-zinc-400">Relationship</span>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
            >
              {RELATIONSHIP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {relationship === "other" && (
            <input
              value={relationshipOther}
              onChange={(e) => setRelationshipOther(e.target.value)}
              placeholder="Describe the relationship"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
            />
          )}

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-zinc-400">First name *</span>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-400">Last name</span>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100" />
            </label>
          </div>

          {/* Birthdate */}
          <label className="flex flex-col gap-1">
            <span className="text-zinc-400">Birthdate <span className="text-zinc-600">(used to compute age)</span></span>
            <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100" />
          </label>

          {/* Interests */}
          <div className="flex flex-col gap-2">
            <span className="text-zinc-400">Interests</span>
            {interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {interests.map((i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-900">
                    {i}
                    <button type="button" aria-label={`Remove ${i}`} onClick={() => setInterests((p) => p.filter((x) => x !== i))} className="text-zinc-500 hover:text-zinc-900">×</button>
                  </span>
                ))}
              </div>
            )}
            <input
              value={interestDraft}
              onChange={(e) => setInterestDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addInterest(interestDraft); } }}
              placeholder="Type an interest, press Enter"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
            />
            {suggestions.filter((s) => !interests.some((i) => i.toLowerCase() === s.toLowerCase())).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions
                  .filter((s) => !interests.some((i) => i.toLowerCase() === s.toLowerCase()))
                  .slice(0, 20)
                  .map((s) => (
                    <button key={s} type="button" onClick={() => addInterest(s)} className="rounded-md border border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white">
                      + {s}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Photo — dashed drop zone: drag a file in or click to select. */}
          <div className="flex flex-col gap-1">
            <span className="text-zinc-400">Photo</span>
            <div className="flex items-center gap-3">
              {photoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  applyPhoto(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors ${
                  dragOver ? "border-[#dfa43a] bg-[#dfa43a]/10" : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900/40"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-zinc-500">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span className="text-xs text-zinc-400">
                  {photoPreview ? "Drag or select a new photo" : "Drag or select a photo"}
                </span>
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => applyPhoto(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </div>
          </div>

          {/* Visibility */}
          <div className="flex flex-col gap-2">
            <span className="text-zinc-400">Who can see this person</span>
            <label className="flex items-center gap-2">
              <input type="radio" name="vis" checked={visibility === "all_claimed"} onChange={() => setVisibility("all_claimed")} className="accent-[#dfa43a]" />
              <span>All festival users who have claimed profiles</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="vis" checked={visibility === "specific"} onChange={() => setVisibility("specific")} className="accent-[#dfa43a]" />
              <span>Specific users</span>
            </label>
            {visibility === "specific" && (
              <div className="ml-6 flex flex-col gap-2">
                {viewers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {viewers.map((v) => (
                      <span key={v.evaluationId} className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-900">
                        {v.name}
                        <button type="button" aria-label={`Remove ${v.name}`} onClick={() => setViewers((p) => p.filter((x) => x.evaluationId !== v.evaluationId))} className="text-zinc-500 hover:text-zinc-900">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <input
                    value={viewerQuery}
                    onChange={(e) => setViewerQuery(e.target.value)}
                    placeholder="Type a name to add…"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
                  />
                  {viewerQuery.trim().length >= 2 && viewerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 shadow-xl">
                      {viewerResults.map((v) => (
                        <button key={v.evaluationId} type="button" onClick={() => addViewer(v)} className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800">
                          {v.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-zinc-600">No one selected = private to you.</p>
              </div>
            )}
          </div>

          {/* Share publicly on my profile — pick a disclosure level shown as a
              badge on the owner's public profile (just the label, never the
              name/photo/birthdate). */}
          <div className="flex flex-col gap-2">
            <span className="text-zinc-400">Share publicly on my profile</span>
            <div className="flex flex-wrap gap-2">
              {shareOptions.map((o) => {
                const active = selectedShare === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setPublicShare(o.value)}
                    aria-pressed={active}
                    className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "border-[#dfa43a] bg-[#dfa43a] text-black"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-zinc-600">
              Shown as a badge on your profile. Add a birthdate to enable the age option.
            </p>
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="rounded-md bg-[#dfa43a] px-3 py-1.5 font-medium text-black hover:bg-[#e8b452] disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
