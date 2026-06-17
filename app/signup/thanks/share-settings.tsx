"use client";

import { useState, useTransition } from "react";
import { SHARE_FIELDS, type ShareFieldKey } from "@/lib/share";
import { setShareEnabled, setShareFields, type ShareResult } from "@/lib/share-actions";

export function ShareSettings({
  signupId,
  initialEnabled,
  initialUrl,
  initialFields,
}: {
  signupId: string;
  initialEnabled: boolean;
  initialUrl: string | null;
  initialFields: ShareFieldKey[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [url, setUrl] = useState(initialUrl);
  const [fields, setFields] = useState<ShareFieldKey[]>(initialFields);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function apply(r: ShareResult) {
    if (r.error) {
      setError(r.error);
      return;
    }
    setError(null);
    setEnabled(r.enabled);
    setUrl(r.url);
    setFields(r.fields);
  }

  function toggleEnabled() {
    const prev = enabled;
    const next = !enabled;
    setEnabled(next); // optimistic
    startTransition(async () => {
      const r = await setShareEnabled(signupId, next);
      if (r.error) {
        setError(r.error);
        setEnabled(prev); // revert — the DB wasn't updated
        return;
      }
      apply(r);
    });
  }

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
      apply(r);
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-white">Your secret share link</h3>
          <p className="mt-1 text-sm text-white/55">
            Off by default. When on, anyone with the link can see the fields you
            choose below — handy for sharing your profile with specific people.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Enable secret share link"
          onClick={toggleEnabled}
          disabled={pending}
          className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            enabled ? "bg-amber-400" : "bg-white/20"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {enabled && (
        <div className="mt-4 flex flex-col gap-4">
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
              What&apos;s visible on the link
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SHARE_FIELDS.map((f) => (
                <label
                  key={f.key}
                  className="flex items-center gap-2 text-sm text-white/80"
                >
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

          <p className="text-xs text-white/40">
            Your name is always shown. Turn the toggle off anytime to instantly
            disable the link.
          </p>
        </div>
      )}
    </div>
  );
}
