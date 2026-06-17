"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { BotIdClient } from "botid/client";
import { GRADES, US_STATES } from "@/lib/options";
import { optimizeImage } from "@/lib/image";
import type { Photo } from "@/lib/db/schema/signups";
import { MentionCaptionInput, type MentionCandidate } from "@/components/mention-caption-input";
import { saveFamily, type FamilyState } from "./actions";

// Effectively unlimited; a high safety ceiling to avoid pathological abuse.
const MAX_PHOTOS = 200;
const initialState: FamilyState = { ok: false };

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40";
const h3Cls = "text-base font-semibold text-white";

function TagPicker({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (!value.some((v) => v.toLowerCase() === t.toLowerCase())) {
      onChange([...value, t]);
    }
    setDraft("");
  };
  const remove = (t: string) => onChange(value.filter((v) => v !== t));
  const available = suggestions.filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div className="mt-1">
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => remove(t)}
              className="rounded-md bg-white px-3 py-1 text-sm font-medium text-black"
            >
              {t} ✕
            </button>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => add(draft)}
        placeholder={placeholder}
        className={inputCls}
      />
      {available.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {available.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => add(s)}
              className="rounded-md border border-white/20 px-3 py-1 text-sm text-white/70 transition-colors hover:bg-white/10"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type ExistingChild = {
  id: string;
  firstName: string;
  grade: string | null;
  birthYear: number | null;
  interests: string[] | null;
  notes: string | null;
  photos: Photo[];
  // pathname -> presigned URL for already-saved (private) child photos.
  photoPreviews: Record<string, string>;
};

export default function FamilyForm({
  signupId,
  suggestedInterests,
  initialCity = "",
  initialUsState = "",
  initialParentInterests = [],
  initialPhotos = [],
  initialPhotoPreviews = {},
  existingChildren = [],
}: {
  signupId: string;
  suggestedInterests: string[];
  initialCity?: string;
  initialUsState?: string;
  initialParentInterests?: string[];
  initialPhotos?: Photo[];
  // pathname -> presigned URL, so already-saved private photos can be shown.
  initialPhotoPreviews?: Record<string, string>;
  existingChildren?: ExistingChild[];
}) {
  const [state, formAction, pending] = useActionState(saveFamily, initialState);

  // Family-level (persists across "add another child"), pre-filled from any
  // existing submission so a returning parent doesn't blank out their own data.
  const [notInUS, setNotInUS] = useState(false);
  const [parentInterests, setParentInterests] = useState<string[]>(initialParentInterests);
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [previews, setPreviews] = useState<Record<string, string>>(initialPhotoPreviews);
  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Child-level (cleared after "add another child")
  const [childFirstName, setChildFirstName] = useState("");
  const [childGrade, setChildGrade] = useState("");
  const [childBirthYear, setChildBirthYear] = useState("");
  const [childInterests, setChildInterests] = useState<string[]>([]);
  const [childNotes, setChildNotes] = useState("");
  const [childPhotos, setChildPhotos] = useState<Photo[]>([]);
  const [childPreviews, setChildPreviews] = useState<Record<string, string>>({});
  const [childUploading, setChildUploading] = useState(0);
  // When set, the child form is editing an existing child (vs adding a new one).
  const [editingChildId, setEditingChildId] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  const lastSavedRef = useRef<FamilyState>(initialState);
  useEffect(() => {
    if (state !== lastSavedRef.current && state.ok) {
      // an "add another child" succeeded — reset only the child fields
      setChildFirstName("");
      setChildGrade("");
      setChildBirthYear("");
      setChildInterests([]);
      setChildNotes("");
      setChildPhotos([]);
      setChildPreviews({});
      setEditingChildId(null);
      lastSavedRef.current = state;
    }
  }, [state]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError(null);
    for (const file of Array.from(files)) {
      if (photos.length + uploading >= MAX_PHOTOS) {
        setPhotoError(`You can add up to ${MAX_PHOTOS} photos.`);
        break;
      }
      setUploading((n) => n + 1);
      try {
        const opt = await optimizeImage(file);
        const fd = new FormData();
        const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
        fd.append("file", new File([opt.blob], name, { type: opt.contentType }));
        fd.append("width", String(opt.width));
        fd.append("height", String(opt.height));
        const res = await fetch("/api/blob/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`upload failed (${res.status})`);
        const meta: Photo = await res.json();
        setPreviews((p) => ({ ...p, [meta.pathname]: URL.createObjectURL(opt.blob) }));
        setPhotos((p) => [...p, meta]);
      } catch (err) {
        console.error(err);
        setPhotoError("A photo failed to upload. Please try again.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function removePhoto(pathname: string) {
    setPhotos((p) => p.filter((x) => x.pathname !== pathname));
  }

  function setCaption(pathname: string, caption: string) {
    setPhotos((p) =>
      p.map((x) => (x.pathname === pathname ? { ...x, caption: caption || undefined } : x)),
    );
  }
  function setChildCaption(pathname: string, caption: string) {
    setChildPhotos((p) =>
      p.map((x) => (x.pathname === pathname ? { ...x, caption: caption || undefined } : x)),
    );
  }

  // People taggable in photos = the children this parent has already added.
  const mentionCandidates: MentionCandidate[] = existingChildren.map((c) => ({
    id: c.id,
    name: c.firstName,
  }));

  // Per-child photo uploads (separate from the family photos above).
  async function onChildFiles(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError(null);
    let count = childPhotos.length + childUploading;
    for (const file of Array.from(files)) {
      if (count >= MAX_PHOTOS) {
        setPhotoError(`You can add up to ${MAX_PHOTOS} photos.`);
        break;
      }
      count++;
      setChildUploading((n) => n + 1);
      try {
        const opt = await optimizeImage(file);
        const fd = new FormData();
        const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
        fd.append("file", new File([opt.blob], name, { type: opt.contentType }));
        fd.append("width", String(opt.width));
        fd.append("height", String(opt.height));
        const res = await fetch("/api/blob/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`upload failed (${res.status})`);
        const meta: Photo = await res.json();
        setChildPreviews((p) => ({ ...p, [meta.pathname]: URL.createObjectURL(opt.blob) }));
        setChildPhotos((p) => [...p, meta]);
      } catch (err) {
        console.error(err);
        setPhotoError("A photo failed to upload. Please try again.");
      } finally {
        setChildUploading((n) => n - 1);
      }
    }
  }
  function removeChildPhoto(pathname: string) {
    setChildPhotos((p) => p.filter((x) => x.pathname !== pathname));
  }

  // Click an existing child to load it into the form for editing.
  function loadChild(c: ExistingChild) {
    setEditingChildId(c.id);
    setChildFirstName(c.firstName);
    setChildGrade(c.grade ?? "");
    setChildBirthYear(c.birthYear ? String(c.birthYear) : "");
    setChildInterests(c.interests ?? []);
    setChildNotes(c.notes ?? "");
    setChildPhotos(c.photos ?? []);
    setChildPreviews(c.photoPreviews ?? {});
    setPhotoError(null);
    if (typeof document !== "undefined") {
      document.getElementById("child-form-anchor")?.scrollIntoView({ behavior: "smooth" });
    }
  }
  function cancelEdit() {
    setEditingChildId(null);
    setChildFirstName("");
    setChildGrade("");
    setChildBirthYear("");
    setChildInterests([]);
    setChildNotes("");
    setChildPhotos([]);
    setChildPreviews({});
  }

  const busy = pending || uploading > 0 || childUploading > 0;

  return (
    <>
      <BotIdClient protect={[{ path: "/signup/thanks", method: "POST" }]} />
      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="signupId" value={signupId} />
        <input type="hidden" name="parentInterests" value={JSON.stringify(parentInterests)} />
        <input type="hidden" name="childInterests" value={JSON.stringify(childInterests)} />
        <input type="hidden" name="photos" value={JSON.stringify(photos)} />
        <input type="hidden" name="childPhotos" value={JSON.stringify(childPhotos)} />
        <input type="hidden" name="childId" value={editingChildId ?? ""} />

        {state.message && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {state.message}
          </p>
        )}
        {state.ok && state.savedChildName && (
          <p className="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-300">
            Saved {state.savedChildName}. Add another child below, or click Done.
          </p>
        )}

        {/* Family-level */}
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="city">City</label>
              <input
                id="city"
                name="city"
                defaultValue={initialCity}
                disabled={notInUS}
                className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-40`}
                autoComplete="address-level2"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="state">State</label>
              <select
                id="state"
                name="state"
                disabled={notInUS}
                defaultValue={initialUsState}
                className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <option value="">Select…</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={notInUS}
              onChange={(e) => setNotInUS(e.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            Not in the US
          </label>
        </div>

        <div>
          <h3 className={h3Cls}>
            Your + your spouse&apos;s interests (select existing or add new ones)
          </h3>
          <TagPicker
            value={parentInterests}
            onChange={setParentInterests}
            suggestions={suggestedInterests}
            placeholder="Type an interest and press Enter"
          />
        </div>

        <div>
          <h3 className={h3Cls}>
            Would you like to share any photos of your family, including
            activities you enjoy?
          </h3>
          <p className="mt-1 text-xs text-white/40">
            Resized &amp; optimized in your browser before upload. Add as many as
            you&rsquo;d like.
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onFiles(e.target.files)}
            className="mt-2 block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
          />
          {photoError && <p className="mt-1 text-sm text-red-400">{photoError}</p>}
          {uploading > 0 && <p className="mt-1 text-sm text-white/50">Uploading {uploading}…</p>}
          {photos.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {photos.map((p) => (
                <div
                  key={p.pathname}
                  className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2"
                >
                  <div className="group relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previews[p.pathname]}
                      alt="family photo"
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(p.pathname)}
                      className="absolute right-1 top-1 rounded-full bg-black/70 px-2 text-xs text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <MentionCaptionInput
                      value={p.caption ?? ""}
                      onChange={(c) => setCaption(p.pathname, c)}
                      candidates={mentionCandidates}
                      placeholder="Caption — type @ to tag a child"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <hr className="border-white/10" />

        {/* Already-registered children (read-only) so returning parents can see
            what's saved. The form below adds another child; it never edits these. */}
        {existingChildren.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold">
              {existingChildren.length === 1 ? "Child you've added" : "Children you've added"}
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {existingChildren.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => loadChild(c)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      editingChildId === c.id
                        ? "border-amber-400 bg-amber-400/10"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/10"
                    }`}
                  >
                    <span className="font-medium text-white/90">{c.firstName}</span>
                    <span className="text-white/50">
                      {c.grade ||
                        (c.birthYear ? `age ${currentYear - c.birthYear}` : "")}{" "}
                      <span aria-hidden>✎</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-white/40">
              Click a child to edit, or use the form below to add another.
            </p>
          </div>
        )}

        {/* Child-level */}
        <div id="child-form-anchor">
          <h2 className="text-lg font-semibold">
            {editingChildId
              ? `Editing ${childFirstName || "this child"}`
              : existingChildren.length > 0
                ? "Add another child"
                : "About your child"}
          </h2>
          <p className="text-sm text-white/50">
            (Feel free to add non-OHS children as well)
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="childFirstName">Child&apos;s first name</label>
            <input
              id="childFirstName"
              name="childFirstName"
              value={childFirstName}
              onChange={(e) => setChildFirstName(e.target.value)}
              className={inputCls}
            />
            {state.errors?.child_firstName && (
              <p className="mt-1 text-sm text-red-400">{state.errors.child_firstName}</p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="childGrade">Grade going into</label>
            <select
              id="childGrade"
              name="childGrade"
              value={childGrade}
              onChange={(e) => setChildGrade(e.target.value)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>

        {childGrade === "Not an OHS child" && (
          <div>
            <label className={labelCls} htmlFor="childBirthYear">Year born</label>
            <select
              id="childBirthYear"
              name="childBirthYear"
              value={childBirthYear}
              onChange={(e) => setChildBirthYear(e.target.value)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {Array.from({ length: 25 }, (_, i) => currentYear - 1 - i).map((y) => (
                <option key={y} value={y}>
                  {y} — age {currentYear - y}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-white/40">
              Used to show the child&apos;s age (auto-calculated).
            </p>
          </div>
        )}

        <div>
          <h3 className={h3Cls}>
            Your child&apos;s interests (select existing or add new ones)
          </h3>
          <TagPicker
            value={childInterests}
            onChange={setChildInterests}
            suggestions={suggestedInterests}
            placeholder="Type an interest and press Enter"
          />
        </div>

        <div>
          <h3 className={h3Cls}>What else should we know about your child?</h3>
          <textarea
            id="childNotes"
            name="childNotes"
            value={childNotes}
            onChange={(e) => setChildNotes(e.target.value)}
            rows={4}
            placeholder="What do they most enjoy doing with others? What would you like to expose them to more (or less) of? What kinds of activities would you like them to do with other OHS kids & families?"
            className={inputCls}
          />
        </div>

        <div>
          <h3 className={h3Cls}>Photos of this child (optional)</h3>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onChildFiles(e.target.files)}
            className="mt-2 block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
          />
          {childUploading > 0 && (
            <p className="mt-1 text-sm text-white/50">Uploading {childUploading}…</p>
          )}
          {childPhotos.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {childPhotos.map((p) => (
                <div
                  key={p.pathname}
                  className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2"
                >
                  <div className="group relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={childPreviews[p.pathname]}
                      alt="child photo"
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeChildPhoto(p.pathname)}
                      className="absolute right-1 top-1 rounded-full bg-black/70 px-2 text-xs text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <MentionCaptionInput
                      value={p.caption ?? ""}
                      onChange={(c) => setChildCaption(p.pathname, c)}
                      candidates={mentionCandidates}
                      placeholder="Caption — type @ to tag a child"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {editingChildId ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              name="intent"
              value="update-child"
              disabled={busy}
              className="rounded-full bg-white px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Save changes
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={busy}
              className="rounded-full border border-white/30 px-6 py-3 font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              name="intent"
              value="done"
              disabled={busy}
              className="rounded-full bg-white px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Done
            </button>
            <button
              type="submit"
              name="intent"
              value="add-another"
              disabled={busy}
              className="rounded-full border border-white/30 px-6 py-3 font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              Done + add another child
            </button>
            <button
              type="submit"
              name="intent"
              value="skip"
              disabled={busy}
              className="rounded-full px-6 py-3 text-white/60 underline-offset-4 hover:underline disabled:opacity-50"
            >
              I&apos;d rather skip this for now
            </button>
          </div>
        )}
      </form>
    </>
  );
}
