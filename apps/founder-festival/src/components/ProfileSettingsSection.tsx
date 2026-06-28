"use client";

import { useState } from "react";
import {
  validateNickname,
  validateSlug,
  validateSlugKind,
  type SlugKind,
} from "@/lib/profile-slug-validate";

type Initial = {
  nickname: string | null;
  slug: string;
  slugKind: SlugKind;
  fullName: string | null;
};

type Props = {
  initial: Initial;
};

const ERROR_COPY: Record<string, string> = {
  slug_empty: "Slug can't be empty.",
  slug_too_long: "Slug is too long (max 64 characters).",
  slug_invalid_chars: "Slug can only contain lowercase letters, numbers, and single hyphens.",
  slug_reserved: "That slug is reserved.",
  slug_taken: "That URL is already in use. Try a different slug.",
  nickname_too_long: "Nickname is too long (max 32 characters).",
  nickname_invalid_chars: "Nickname can't contain line breaks or control characters.",
  role_invalid: "Pick founder or investor.",
};

export function ProfileSettingsSection({ initial }: Props) {
  const [nickname, setNickname] = useState<string>(initial.nickname ?? "");
  const [slug, setSlug] = useState<string>(initial.slug);
  const [slugKind, setSlugKind] = useState<SlugKind>(initial.slugKind);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverErrorField, setServerErrorField] = useState<string | null>(null);

  // Live client-side validation. Server is authoritative; this just gives
  // the user immediate feedback.
  const nicknameCheck = validateNickname(nickname);
  const slugCheck = validateSlug(slug);
  const roleCheck = validateSlugKind(slugKind);

  const nicknameErr =
    !nicknameCheck.ok ? ERROR_COPY[nicknameCheck.error] : null;
  const slugErr = !slugCheck.ok ? ERROR_COPY[slugCheck.error] : null;
  const roleErr = !roleCheck.ok ? ERROR_COPY[roleCheck.error] : null;

  const dirty =
    (nicknameCheck.ok ? nicknameCheck.value : null) !== initial.nickname ||
    (slugCheck.ok ? slugCheck.value : initial.slug) !== initial.slug ||
    slugKind !== initial.slugKind;

  const canSave = dirty && nicknameCheck.ok && slugCheck.ok && roleCheck.ok && !saving;

  const previewName = nickname.trim() || initial.fullName || "there";
  const previewSlug = slugCheck.ok ? slugCheck.value : slug;
  const previewUrl = `https://festival.so/profile/${slugKind}/${previewSlug}`;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    setServerError(null);
    setServerErrorField(null);
    setSavedAt(null);
    try {
      const res = await fetch("/api/account/profile-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nickname: nicknameCheck.ok ? nicknameCheck.value : null,
          slug: slugCheck.ok ? slugCheck.value : slug,
          slugKind,
        }),
      });
      const data: { ok?: boolean; error?: string; field?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        setServerError(ERROR_COPY[data.error ?? ""] ?? data.error ?? "Couldn't save.");
        setServerErrorField(data.field ?? null);
      } else {
        setSavedAt(Date.now());
        // Update "initial" baseline by mutating refs — simplest: reload-friendly
        // values stay in component state, and the next render's `dirty` check
        // compares the saved values to themselves.
        Object.assign(initial, {
          nickname: nicknameCheck.ok ? nicknameCheck.value : null,
          slug: slugCheck.ok ? slugCheck.value : slug,
          slugKind,
        });
      }
    } catch {
      setServerError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      id="profile-url-nickname"
      className="mt-12 border-t border-zinc-800 pt-8 scroll-mt-6"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Profile URL & Nickname
        </h2>
        <a
          href={`/profile/${slugKind}/${slug}`}
          className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800/40"
        >
          View Profile
        </a>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        How you&apos;re addressed on your profile and the URL people can find you at.
      </p>

      <div className="flex flex-col gap-6">
        {/* Nickname */}
        <div className="flex flex-col gap-2">
          <label htmlFor="ps-nickname" className="text-sm font-medium text-zinc-200">
            Nickname
          </label>
          <p className="text-xs text-zinc-500 -mt-1">
            Optional. Replaces your full name in the profile heading and in
            our emails. Leave blank to keep using your full name.
          </p>
          <input
            id="ps-nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={64} /* loose maxLength; validator enforces 32 trimmed */
            placeholder="e.g. DROdio"
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          />
          {nicknameErr && <p className="text-xs text-red-400">{nicknameErr}</p>}
          {serverErrorField === "nickname" && serverError && (
            <p className="text-xs text-red-400">{serverError}</p>
          )}
          <div className="rounded bg-zinc-900/60 border border-zinc-800 p-3 mt-1">
            <div className="text-base font-semibold">Welcome {previewName}</div>
            {initial.fullName && nickname.trim() && (
              <div className="text-xs text-zinc-500 mt-0.5">{initial.fullName}</div>
            )}
          </div>
        </div>

        {/* Default URL role */}
        <div className="flex flex-col gap-2">
          <label htmlFor="ps-role" className="text-sm font-medium text-zinc-200">
            Default URL
          </label>
          <p className="text-xs text-zinc-500 -mt-1">
            Both <code>/founder</code> and <code>/investor</code> URLs will
            keep working — this just picks the one used in share links and
            search results.
          </p>
          <select
            id="ps-role"
            value={slugKind}
            onChange={(e) => setSlugKind(e.target.value as SlugKind)}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          >
            <option value="founder">/founder</option>
            <option value="investor">/investor</option>
          </select>
          {roleErr && <p className="text-xs text-red-400">{roleErr}</p>}
          {serverErrorField === "role" && serverError && (
            <p className="text-xs text-red-400">{serverError}</p>
          )}
        </div>

        {/* Slug */}
        <div className="flex flex-col gap-2">
          <label htmlFor="ps-slug" className="text-sm font-medium text-zinc-200">
            URL slug
          </label>
          <p className="text-xs text-zinc-500 -mt-1">
            Lowercase letters, numbers, and single hyphens. If you change it,
            the old URL keeps working as a redirect.
          </p>
          <input
            id="ps-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={64}
            placeholder="e.g. daniel-odio"
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          />
          {slugErr && <p className="text-xs text-red-400">{slugErr}</p>}
          {serverErrorField === "slug" && serverError && (
            <p className="text-xs text-red-400">{serverError}</p>
          )}
          <div className="text-xs text-zinc-500 mt-1">
            Your profile URL: <span className="text-zinc-300">{previewUrl}</span>
          </div>
        </div>

        {/* Save row */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="bg-zinc-100 text-zinc-950 hover:bg-white disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed rounded px-4 py-2 text-sm font-medium transition-colors"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && !dirty && (
            <span className="text-xs text-emerald-400">Saved.</span>
          )}
          {serverError && !serverErrorField && (
            <span className="text-xs text-red-400">{serverError}</span>
          )}
        </div>
      </div>
    </section>
  );
}
