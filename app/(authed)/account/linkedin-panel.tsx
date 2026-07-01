"use client";

import { useActionState, useState } from "react";
import { IconLinkedin } from "@/components/icons";
import { updateLinkedin, type LinkedinState } from "./actions";

// Shows the parent's connected LinkedIn and lets them add/edit it themselves.
// Accounts created before the signup form collected LinkedIn have no value on
// file; this is the only place they can fill it in without an admin. Display +
// edit live in one panel: the saved link (or a "not added yet" hint) is always
// visible, and an inline form appears when they choose to add/change it.
export function LinkedinPanel({
  initialUrl,
  // Whether a saved LinkedIn would actually be visible to other OHS families
  // right now: it requires share visibility "OHS Families" AND the "links" share
  // field enabled (both live in ShareSettings below). When either is off we tell
  // the parent after a save so "families can reach you" isn't a false promise.
  visibleToFamilies = false,
}: {
  initialUrl: string | null;
  visibleToFamilies?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<LinkedinState, FormData>(
    updateLinkedin,
    {},
  );

  // On a successful save the action returns the new (or cleared) URL — render
  // the connected link from that so it updates immediately; otherwise the
  // server-provided initial value stands. The editor stays open after a save so
  // the "Saved" confirmation shows in place; the parent closes it with Done.
  const saved = state.ok ? state.url ?? null : initialUrl;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <IconLinkedin className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
              LinkedIn
            </p>
            {saved ? (
              <a
                href={saved}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block break-all text-sm font-medium text-amber-300 underline decoration-amber-400/50 underline-offset-2 hover:text-amber-200"
              >
                {saved}
              </a>
            ) : (
              <p className="mt-1 text-sm text-white/45">Not added yet</p>
            )}
          </div>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            {saved ? "Edit" : "Add LinkedIn"}
          </button>
        )}
      </div>

      {editing && (
        <form action={formAction} className="mt-4 flex flex-col gap-2">
          <label htmlFor="linkedin_url" className="text-xs text-white/55">
            Your LinkedIn profile URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="linkedin_url"
              name="linkedin_url"
              // type="text" (not "url"): the native URL constraint rejects the
              // scheme-less "linkedin.com/in/you" value the placeholder implies
              // and the server validator explicitly upgrades to https. Let the
              // server (linkedin.ts) do the parsing/upgrading it was built for.
              type="text"
              inputMode="url"
              defaultValue={saved ?? ""}
              placeholder="https://linkedin.com/in/you"
              className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="shrink-0 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={pending}
                className="shrink-0 rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
              >
                {state.ok ? "Done" : "Cancel"}
              </button>
            </div>
          </div>
          <p className="text-xs text-white/40">
            Leave blank and save to remove your LinkedIn.
          </p>
          {state.error && <p className="text-sm text-red-400">{state.error}</p>}
          {state.ok && (
            <>
              <p className="text-sm font-medium text-emerald-300">
                Saved. Your LinkedIn is up to date.
              </p>
              {/* Only promise reachability when it's actually true. A saved
                  LinkedIn is shown to other families only if visibility is "OHS
                  Families" AND the "LinkedIn & GitHub links" share field is on
                  (both below, and off by default). Otherwise say so plainly. */}
              {state.url && !visibleToFamilies && (
                <p className="text-xs text-amber-300/90">
                  It&apos;s saved but not yet visible to other families. To let
                  them reach you, set visibility to &ldquo;OHS Families&rdquo; and
                  turn on &ldquo;LinkedIn &amp; GitHub links&rdquo; in the sharing
                  controls below.
                </p>
              )}
            </>
          )}
        </form>
      )}
    </div>
  );
}
