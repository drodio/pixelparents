"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GRADES, US_STATES } from "@/lib/options";
import { optimizeImage } from "@/lib/image";
import type { Photo } from "@/lib/db/schema/signups";
import { MentionCaptionInput, type MentionCandidate } from "@/components/mention-caption-input";
import { useAutoSave } from "@/lib/use-auto-save";
import { SaveStatus } from "@/components/save-status";
import { patchSignup, type SignupPatch } from "../actions";
import { addChild, patchChild, removeChild, type ChildPatch } from "./actions";

const MAX_PHOTOS = 200;
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
    // If an interest already exists (case-insensitively) — either in this list or
    // in the shared suggestion pool — reuse that exact spelling instead of adding
    // a case-variant duplicate ("mountain biking" -> existing "Mountain Biking").
    const existing = suggestions.find((s) => s.toLowerCase() === t.toLowerCase());
    const next = existing ?? t;
    if (!value.some((v) => v.toLowerCase() === next.toLowerCase())) onChange([...value, next]);
    setDraft("");
  };
  const remove = (t: string) => onChange(value.filter((v) => v !== t));
  const available = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
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

// Self-contained photo editor: handles upload, remove, and captions, and calls
// onSave(photos) with the full array whenever it changes (the parent auto-saves).
function PhotoUploader({
  initialPhotos,
  initialPreviews,
  onSave,
  candidates,
  showMainPill = false,
}: {
  initialPhotos: Photo[];
  initialPreviews: Record<string, string>;
  onSave: (photos: Photo[]) => void;
  candidates: MentionCandidate[];
  // When true, the first photo is labeled "Main Photo" (it's used as the /p banner).
  showMainPill?: boolean;
}) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  const [previews, setPreviews] = useState<Record<string, string>>(initialPreviews);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Enlarged-photo lightbox (holds the URL to show, or null when closed).
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox]);

  function mutate(next: Photo[]) {
    photosRef.current = next;
    setPhotos(next);
    onSave(next);
  }

  // Reorder a photo by one position. The first photo is the "main" one (used as
  // the /p banner for family photos), so this lets a parent choose it.
  function move(from: number, dir: -1 | 1) {
    const to = from + dir;
    const cur = photosRef.current;
    if (to < 0 || to >= cur.length) return;
    const next = [...cur];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    mutate(next);
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      if (photosRef.current.length + uploading >= MAX_PHOTOS) {
        setError(`You can add up to ${MAX_PHOTOS} photos.`);
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
        mutate([...photosRef.current, meta]);
      } catch (err) {
        console.error(err);
        setError("A photo failed to upload. Please try again.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => onFiles(e.target.files)}
        className="mt-2 block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
      />
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
      {uploading > 0 && <p className="mt-1 text-sm text-white/50">Uploading {uploading}…</p>}
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {photos.map((p, i) => (
            <div key={p.pathname} className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <div className="group relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previews[p.pathname]}
                  alt="photo"
                  onClick={() => setLightbox(previews[p.pathname] ?? null)}
                  className="h-20 w-20 cursor-zoom-in rounded-lg object-cover"
                />
                {showMainPill && i === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-black">
                    Main Photo
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => mutate(photosRef.current.filter((x) => x.pathname !== p.pathname))}
                  className="absolute right-1 top-1 rounded-full bg-black/70 px-2 text-xs text-white"
                >
                  ✕
                </button>
                {photos.length > 1 && (
                  <div className="absolute inset-x-1 bottom-1 flex justify-between">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label="Move earlier"
                      className="rounded bg-black/70 px-1.5 text-xs text-white disabled:opacity-30"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={i === photos.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label="Move later"
                      className="rounded bg-black/70 px-1.5 text-xs text-white disabled:opacity-30"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <MentionCaptionInput
                  value={p.caption ?? ""}
                  onChange={(c) =>
                    mutate(
                      photosRef.current.map((x) =>
                        x.pathname === p.pathname ? { ...x, caption: c || undefined } : x,
                      ),
                    )
                  }
                  candidates={candidates}
                  placeholder="Caption — type @ to tag a child"
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Enlarged photo"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close"
            className="absolute right-4 top-4 text-3xl leading-none text-white/70 hover:text-white"
          >
            ✕
          </button>
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
  photoPreviews: Record<string, string>;
};

// One child's card — every field auto-saves independently via patchChild.
function ChildCard({
  child,
  signupId,
  suggestedInterests,
  candidates,
  index,
  onRemove,
}: {
  child: ExistingChild;
  signupId: string;
  suggestedInterests: string[];
  candidates: MentionCandidate[];
  index: number;
  onRemove: () => void;
}) {
  const save = useCallback(
    async (patch: ChildPatch) => {
      const r = await patchChild(child.id, signupId, patch);
      if (!r.ok) throw new Error("save failed");
    },
    [child.id, signupId],
  );
  const { queue, status } = useAutoSave<ChildPatch>(save);

  const [firstName, setFirstName] = useState(child.firstName);
  const [grade, setGrade] = useState(child.grade ?? "");
  const [birthYear, setBirthYear] = useState(child.birthYear ? String(child.birthYear) : "");
  const [interests, setInterests] = useState<string[]>(child.interests ?? []);
  const [notes, setNotes] = useState(child.notes ?? "");
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-amber-400">
          {firstName.trim() || `Child ${index + 1}`}
        </h3>
        <div className="flex items-center gap-3">
          <SaveStatus status={status} />
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-white/40 underline-offset-2 hover:text-red-400 hover:underline"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Child&apos;s first name</label>
          <input
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              queue({ firstName: e.target.value });
            }}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Grade going into</label>
          <select
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              queue({ grade: e.target.value }, true);
            }}
            className={inputCls}
          >
            <option value="">Select…</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      {grade === "Not an OHS child" && (
        <div>
          <label className={labelCls}>Year born</label>
          <select
            value={birthYear}
            onChange={(e) => {
              setBirthYear(e.target.value);
              queue({ birthYear: e.target.value ? Number(e.target.value) : null }, true);
            }}
            className={inputCls}
          >
            <option value="">Select…</option>
            {Array.from({ length: 25 }, (_, i) => currentYear - 1 - i).map((y) => (
              <option key={y} value={y}>{y} — age {currentYear - y}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-white/40">Used to show the child&apos;s age (auto-calculated).</p>
        </div>
      )}

      <div>
        <h4 className={h3Cls}>Your child&apos;s interests</h4>
        <TagPicker
          value={interests}
          onChange={(next) => {
            setInterests(next);
            queue({ interests: next }, true);
          }}
          suggestions={suggestedInterests}
          placeholder="Type an interest and press Enter"
        />
      </div>

      <div>
        <h4 className={h3Cls}>What else should we know about your child?</h4>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            queue({ notes: e.target.value });
          }}
          rows={4}
          placeholder="What do they most enjoy doing with others? What would you like to expose them to more (or less) of? What kinds of activities would you like them to do with other OHS kids & families?"
          className={inputCls}
        />
      </div>

      <div>
        <h4 className={h3Cls}>Photos of this child (optional)</h4>
        <PhotoUploader
          initialPhotos={child.photos}
          initialPreviews={child.photoPreviews}
          onSave={(photos) => queue({ photos }, true)}
          candidates={candidates}
        />
      </div>
    </div>
  );
}

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
  initialPhotoPreviews?: Record<string, string>;
  existingChildren?: ExistingChild[];
}) {
  const saveFamily = useCallback(
    async (patch: SignupPatch) => {
      const r = await patchSignup(signupId, patch);
      if (!r.ok) throw new Error("save failed");
    },
    [signupId],
  );
  const { queue, status } = useAutoSave<SignupPatch>(saveFamily);

  const [notInUS, setNotInUS] = useState(false);
  const [city, setCity] = useState(initialCity);
  const [usState, setUsState] = useState(initialUsState);
  const [parentInterests, setParentInterests] = useState<string[]>(initialParentInterests);
  const [children, setChildren] = useState<ExistingChild[]>(existingChildren);
  const [adding, setAdding] = useState(false);

  const candidates: MentionCandidate[] = children.map((c) => ({ id: c.id, name: c.firstName }));

  async function onAddChild() {
    setAdding(true);
    const r = await addChild(signupId);
    setAdding(false);
    if ("id" in r) {
      setChildren((cs) => [
        ...cs,
        { id: r.id, firstName: "", grade: null, birthYear: null, interests: [], notes: null, photos: [], photoPreviews: {} },
      ]);
    }
  }

  async function onRemoveChild(id: string) {
    setChildren((cs) => cs.filter((c) => c.id !== id));
    await removeChild(id, signupId);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-end">
        <SaveStatus status={status} />
      </div>

      {/* Family-level */}
      <section className="flex flex-col gap-6">
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="city">City</label>
              <input
                id="city"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  queue({ city: e.target.value });
                }}
                disabled={notInUS}
                className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-40`}
                autoComplete="address-level2"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="state">State</label>
              <select
                id="state"
                disabled={notInUS}
                value={usState}
                onChange={(e) => {
                  setUsState(e.target.value);
                  queue({ state: e.target.value }, true);
                }}
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
              onChange={(e) => {
                setNotInUS(e.target.checked);
                if (e.target.checked) {
                  setCity("");
                  setUsState("");
                  queue({ city: "", state: "" }, true);
                }
              }}
              className="h-4 w-4 accent-amber-500"
            />
            Not in the US
          </label>
        </div>

        <div>
          <h3 className={h3Cls}>Your + your spouse&apos;s interests (select existing or add new ones)</h3>
          <TagPicker
            value={parentInterests}
            onChange={(next) => {
              setParentInterests(next);
              queue({ parentInterests: next }, true);
            }}
            suggestions={suggestedInterests}
            placeholder="Type an interest and press Enter"
          />
        </div>

        <div>
          <h3 className={h3Cls}>Would you like to share any photos of your family?</h3>
          <p className="mt-1 text-xs text-white/40">Resized &amp; optimized in your browser before upload. Add as many as you&rsquo;d like.</p>
          <PhotoUploader
            initialPhotos={initialPhotos}
            initialPreviews={initialPhotoPreviews}
            onSave={(photos) => queue({ photos }, true)}
            candidates={candidates}
            showMainPill
          />
        </div>
      </section>

      <hr className="border-white/10" />

      {/* Children */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Your children</h2>
          <p className="text-sm text-white/50">(Feel free to add non-OHS children as well)</p>
        </div>

        {children.map((c, i) => (
          <ChildCard
            key={c.id}
            child={c}
            index={i}
            signupId={signupId}
            suggestedInterests={suggestedInterests}
            candidates={candidates}
            onRemove={() => onRemoveChild(c.id)}
          />
        ))}

        <button
          type="button"
          onClick={onAddChild}
          disabled={adding}
          className="self-start rounded-full border border-white/30 px-6 py-3 font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {adding ? "Adding…" : "+ Add a child"}
        </button>
      </section>

      <div className="flex items-center gap-3">
        <Link
          href="/signup/welcome"
          className="rounded-full bg-white px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90"
        >
          Finish →
        </Link>
        <span className="text-xs text-white/40">Everything saves automatically as you go.</span>
      </div>
    </div>
  );
}
