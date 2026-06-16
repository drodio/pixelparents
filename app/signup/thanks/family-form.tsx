"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { BotIdClient } from "botid/client";
import { GRADES, US_STATES } from "@/lib/options";
import { optimizeImage } from "@/lib/image";
import type { Photo } from "@/lib/db/schema/signups";
import { saveFamily, type FamilyState } from "./actions";

const MAX_PHOTOS = 8;
const initialState: FamilyState = { ok: false };

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40";

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
              className="rounded-full bg-white px-3 py-1 text-sm font-medium text-black"
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
              className="rounded-full border border-white/20 px-3 py-1 text-sm text-white/70 transition-colors hover:bg-white/10"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FamilyForm({
  signupId,
  suggestedInterests,
}: {
  signupId: string;
  suggestedInterests: string[];
}) {
  const [state, formAction, pending] = useActionState(saveFamily, initialState);

  // Family-level (persists across "add another child")
  const [notInUS, setNotInUS] = useState(false);
  const [parentInterests, setParentInterests] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Child-level (cleared after "add another child")
  const [childFirstName, setChildFirstName] = useState("");
  const [childGrade, setChildGrade] = useState("");
  const [childInterests, setChildInterests] = useState<string[]>([]);
  const [childNotes, setChildNotes] = useState("");

  const lastSavedRef = useRef<FamilyState>(initialState);
  useEffect(() => {
    if (state !== lastSavedRef.current && state.ok) {
      // an "add another child" succeeded — reset only the child fields
      setChildFirstName("");
      setChildGrade("");
      setChildInterests([]);
      setChildNotes("");
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

  const busy = pending || uploading > 0;

  return (
    <>
      <BotIdClient protect={[{ path: "/signup/thanks", method: "POST" }]} />
      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="signupId" value={signupId} />
        <input type="hidden" name="parentInterests" value={JSON.stringify(parentInterests)} />
        <input type="hidden" name="childInterests" value={JSON.stringify(childInterests)} />
        <input type="hidden" name="photos" value={JSON.stringify(photos)} />

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
                defaultValue=""
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
              className="accent-white"
            />
            Not in the US
          </label>
        </div>

        <div>
          <label className={labelCls}>
            Your + your spouse&apos;s interests (select existing or add new ones)
          </label>
          <TagPicker
            value={parentInterests}
            onChange={setParentInterests}
            suggestions={suggestedInterests}
            placeholder="Type an interest and press Enter"
          />
        </div>

        <div>
          <label className={labelCls}>
            Photos of things you enjoy doing as a family
          </label>
          <p className="mt-1 text-xs text-white/40">
            Resized &amp; optimized in your browser before upload. Up to {MAX_PHOTOS}.
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
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p) => (
                <div key={p.pathname} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previews[p.pathname]}
                    alt="family photo"
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(p.pathname)}
                    className="absolute right-1 top-1 rounded-full bg-black/70 px-2 text-xs text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <hr className="border-white/10" />

        {/* Child-level */}
        <h2 className="text-lg font-semibold">About your child</h2>
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

        <div>
          <label className={labelCls}>
            Your child&apos;s interests (select existing or add new ones)
          </label>
          <TagPicker
            value={childInterests}
            onChange={setChildInterests}
            suggestions={suggestedInterests}
            placeholder="Type an interest and press Enter"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="childNotes">
            What else should we know about your child?
          </label>
          <textarea
            id="childNotes"
            name="childNotes"
            value={childNotes}
            onChange={(e) => setChildNotes(e.target.value)}
            rows={3}
            className={inputCls}
          />
        </div>

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
      </form>
    </>
  );
}
