"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { SHARE_FIELDS, type ShareFieldKey, type ShareVisibility } from "@/lib/share";
import { setShareFields } from "@/lib/share-actions";
import { VisibilityControl } from "@/components/visibility-control";

export function ShareSettings({
  signupId,
  initialUrl,
  initialFields,
  initialVisibility,
}: {
  signupId: string;
  initialUrl: string | null;
  initialFields: ShareFieldKey[];
  initialVisibility: ShareVisibility;
}) {
  const [fields, setFields] = useState<ShareFieldKey[]>(initialFields);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const url = initialUrl;

  function toggleField(key: ShareFieldKey) {
    const prev = fields;
    const next = fields.includes(key)
      ? fields.filter((f) => f !== key)
      : [...fields, key];
    setFields(next); // optimistic
    startTransition(async () => {
      const r = await setShareFields(signupId, next);
      if (r.error) {
        setError(r.error);
        setFields(prev); // revert — the DB wasn't updated
        return;
      }
      setError(null);
      setFields(r.fields);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* user can select & copy manually */
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-white">
            Share your family profile with other OHS families?
          </h3>
          <p className="mt-1 text-sm text-white/55">
            Select{" "}
            <code className="rounded bg-white/10 px-1 font-mono text-white/90">OHS families</code>{" "}
            below to allow other logged in OHS family users to see your family
            profile.
          </p>
        </div>
        <VisibilityControl id={signupId} mode="signup" value={initialVisibility} editable loggedIn />
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-4 flex flex-col gap-4">
        {initialVisibility === "ohs" && (
          <p className="text-sm text-white/70">
            Your family profile is now listed in our{" "}
            <Link
              href="/directory"
              className="text-amber-400 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-300"
            >
              OHS directory showcase
            </Link>
            . You can also share this direct link with them:
          </p>
        )}
        {url && (
          <div className="flex items-center gap-3">
            <code className="flex-1 overflow-x-auto rounded-md border border-white/10 bg-black/60 px-3 py-2 font-mono text-xs text-white/90">
              {url}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
            Choose what&apos;s visible in the OHS directory showcase:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SHARE_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={fields.includes(f.key)}
                  onChange={() => toggleField(f.key)}
                  disabled={pending}
                  className="accent-amber-400"
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/40">Your name is always shown.</p>
      </div>
    </div>
  );
}
