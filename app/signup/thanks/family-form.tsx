"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { GRADES } from "@/lib/options";
import { optimizeImage } from "@/lib/image";
import type { Photo } from "@/lib/db/schema/signups";
import { MentionCaptionInput, type MentionCandidate } from "@/components/mention-caption-input";
import { iconForInterest } from "@/lib/interest-icons";
import { TagList } from "@/components/tag-list";
import { useAutoSave } from "@/lib/use-auto-save";
import { SaveStatus } from "@/components/save-status";
import { IconX } from "@/components/icons";
import { addChild, patchChild, removeChild, type ChildPatch } from "./actions";

const MAX_PHOTOS = 200;
const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40";
const h3Cls = "text-base font-semibold text-white";

// Client-safe mirror of lib/verify.ts#isStudentEmail. We deliberately do NOT
// import that module here — it imports node:crypto at the top level, which would
// be pulled into the client bundle. The server (patchChild) sanitizes anyway;
// this is just a soft inline hint.
function looksLikeStanfordEmail(raw: string): boolean {
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  const domain = e.split("@")[1] ?? "";
  return domain === "stanford.edu" || domain.endsWith(".stanford.edu");
}

// Highlights the typed portion of a suggestion in gold as it matches.
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-amber-400">{text.slice(i, i + query.length)}</span>
      {text.slice(i + query.length)}
    </>
  );
}

export function TagPicker({
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
  const q = draft.trim();
  const ql = q.toLowerCase();

  // Add a tag — preferring an existing suggestion's exact spelling so typing
  // "biking" selects the existing "Biking" rather than creating a near-duplicate.
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const canonical = suggestions.find((s) => s.toLowerCase() === t.toLowerCase()) ?? t;
    if (!value.some((v) => v.toLowerCase() === canonical.toLowerCase())) {
      onChange([...value, canonical]);
    }
    setDraft("");
  };
  const remove = (t: string) => onChange(value.filter((v) => v !== t));

  const notSelected = suggestions.filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()),
  );
  // As you type, only keep suggestions that contain the typed text.
  const available = ql ? notSelected.filter((s) => s.toLowerCase().includes(ql)) : notSelected;
  // When the typed text isn't already an existing label (or selected), offer it
  // as a gold "create new" chip at the bottom of the list. Enter still adds it too.
  const matchesExisting = suggestions.some((s) => s.toLowerCase() === ql);
  const alreadySelected = value.some((v) => v.toLowerCase() === ql);
  const showCreateNew = q !== "" && !matchesExisting && !alreadySelected;

  return (
    <div className="mt-1">
      {/* Selected tags compress to the first few + "+N more" so a long list of
          picks doesn't bury the input below it. Each chip stays a click-to-remove
          button; expanding reveals the rest inline. */}
      {value.length > 0 && (
        <TagList
          tags={value}
          className="mb-2 flex flex-wrap items-center gap-2"
          toggleClassName="inline-flex items-center rounded-md border border-white/20 px-3 py-1 text-sm font-medium text-white/70 transition-colors hover:bg-white/10"
          renderTag={(t) => {
            const Icon = iconForInterest(t);
            return (
              <button
                type="button"
                key={t}
                onClick={() => remove(t)}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-sm font-medium text-black"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {t} <IconX className="h-3 w-3" />
              </button>
            );
          }}
        />
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
      {(available.length > 0 || showCreateNew) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {available.map((s) => {
            const Icon = iconForInterest(s);
            const exact = ql !== "" && s.toLowerCase() === ql;
            return (
              <button
                type="button"
                key={s}
                // Stop the input's onBlur (which would add the raw draft) from
                // firing before this click registers.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-sm transition-colors hover:bg-white/10 ${
                  exact
                    ? "border-amber-400 text-amber-400"
                    : "border-white/20 text-white/70"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {exact ? s : <HighlightedText text={s} query={q} />}
              </button>
            );
          })}
          {showCreateNew && (
            <button
              type="button"
              // Same onBlur guard as the suggestion chips above.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(q)}
              title={`Add "${q}" as a new interest`}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-amber-400/10 px-3 py-1 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-400/20"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              {q}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Self-contained photo editor: handles upload, remove, and captions, and calls
// onSave(photos) with the full array whenever it changes (the parent auto-saves).
export function PhotoUploader({
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
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white"
                  aria-label="Remove photo"
                >
                  <IconX className="h-3.5 w-3.5" />
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
            className="absolute right-4 top-4 leading-none text-white/70 hover:text-white"
          >
            <IconX className="h-7 w-7" />
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
  studentEmail: string | null;
  photos: Photo[];
  photoPreviews: Record<string, string>;
  // Age-16 contact-gate status: 'none' | 'pending' | 'certified'. A parent
  // certifies here to unmask the student's own contact. See lib/contact-visibility.
  age16Status?: string | null;
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
  const [studentEmail, setStudentEmail] = useState(child.studentEmail ?? "");
  const [age16, setAge16] = useState<string>(child.age16Status ?? "none");
  const currentYear = new Date().getFullYear();

  // Parent certifies (or revokes) that this student is 16+. Certifying unmasks the
  // student's own contact to the community; otherwise the parent's contact is shown
  // in its place. Also the approval path for a student's pending self-request.
  // Routed through the id-authorized patchChild autosave so it works BOTH during
  // signup (no Clerk session yet) and on the authed /family page. patchChild stamps
  // the acting parent's id + timestamp for attribution.
  function toggleAge16(next: boolean) {
    setAge16(next ? "certified" : "none");
    queue({ age16Certified: next }, true);
  }

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
            {/* Start at the current year so a newborn (age 0) is selectable —
                families are invited to add non-OHS children including infants. */}
            {Array.from({ length: 26 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>{y} — age {currentYear - y}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-white/40">Used to show the child&apos;s age (auto-calculated).</p>
        </div>
      )}

      <div>
        <label className={labelCls}>Student&apos;s Stanford email (optional)</label>
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={studentEmail}
          onChange={(e) => {
            setStudentEmail(e.target.value);
            queue({ studentEmail: e.target.value });
          }}
          placeholder="name@ohs.stanford.edu"
          className={inputCls}
        />
        {studentEmail.trim() !== "" && !looksLikeStanfordEmail(studentEmail) ? (
          <p className="mt-1 text-xs text-amber-400/80">
            This doesn&apos;t look like a stanford.edu address — it&apos;ll still save.
          </p>
        ) : (
          <p className="mt-1 text-xs text-white/40">
            Your OHS student&apos;s stanford.edu address — used to verify your family.
          </p>
        )}
      </div>

      {/* Age-16 contact gate. A student's own contact stays private (the parent's
          contact is shown in its place across the community) until a parent
          certifies they're 16 or older. If the student asked (status 'pending'),
          checking the box approves the request. */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <label className="flex items-start gap-2 text-sm text-white/85">
          <input
            type="checkbox"
            checked={age16 === "certified"}
            onChange={(e) => toggleAge16(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-amber-500"
          />
          <span>
            This student is <strong>16 or older</strong> — show their own contact
            info to the community.
            <span className="mt-0.5 block text-xs text-white/45">
              Until you certify this, the community sees your (parent) contact
              instead of the student&apos;s.
            </span>
          </span>
        </label>
        {age16 === "pending" && (
          <p className="mt-2 text-xs text-amber-300">
            Your student requested to be certified as 16+ — check the box above to
            approve.
          </p>
        )}
      </div>

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
          placeholder="What do they most enjoy doing with others? What would you like to expose them to more (or less) of? What kinds of activities would you like them to do with other OHS students & families?"
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
  existingChildren = [],
  // Only the signup onboarding flow (app/signup/thanks) shows the trailing
  // "Finish →" CTA that links to /signup/welcome. The /family editor reuses this
  // form for an already-onboarded parent, where that CTA would bounce them into
  // the new-user completion screen — so it defaults OFF there.
  showFinish = false,
}: {
  signupId: string;
  suggestedInterests: string[];
  existingChildren?: ExistingChild[];
  showFinish?: boolean;
}) {
  const [children, setChildren] = useState<ExistingChild[]>(existingChildren);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const candidates: MentionCandidate[] = children.map((c) => ({ id: c.id, name: c.firstName }));

  async function onAddChild() {
    setAdding(true);
    setAddError(null);
    const r = await addChild(signupId);
    setAdding(false);
    if ("id" in r) {
      setChildren((cs) => [
        ...cs,
        { id: r.id, firstName: "", grade: null, birthYear: null, interests: [], notes: null, studentEmail: null, photos: [], photoPreviews: {} },
      ]);
    } else {
      // The write failed / returned a non-{id} shape. Surface it inline instead
      // of silently flipping the button back with no new row (which reads as a
      // dead button).
      setAddError("Couldn’t add a child — please try again.");
    }
  }

  async function onRemoveChild(id: string) {
    setChildren((cs) => cs.filter((c) => c.id !== id));
    await removeChild(id, signupId);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Children */}
      <section className="flex flex-col gap-4">
        <div>
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
        {addError && (
          <p className="text-sm text-red-400" aria-live="polite">
            {addError}
          </p>
        )}
      </section>

      <div className="flex items-center gap-3">
        {showFinish && (
          <Link
            // Pass the signup id so the welcome screen can be status-aware
            // (already-verified families get a dashboard prompt, not "wait for an
            // email that isn't coming").
            href={`/signup/welcome?id=${encodeURIComponent(signupId)}`}
            className="rounded-full bg-white px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90"
          >
            Finish →
          </Link>
        )}
        <span className="text-xs text-white/40">Everything saves automatically as you go.</span>
      </div>
    </div>
  );
}
