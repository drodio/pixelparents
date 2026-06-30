"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { IconX, IconPlus } from "@/components/icons";
import type { MemberSuggestion } from "@/lib/db/events";
import {
  searchMembersAction,
  addEventAdminAction,
  removeEventAdminAction,
} from "../actions";

type AdminEntry = { signupId: string; name: string; isAuthor: boolean };

// Per-event organizer manager. Typing a name shows live autocomplete suggestions
// of EXISTING signed-up accounts only (server action queries signups by name);
// picking one adds them via signup id, so only a real account can ever be added.
// The author is pinned and can't be removed.
export function AdminManager({
  eventId,
  admins,
}: {
  eventId: string;
  admins: AdminEntry[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<MemberSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const existingIds = new Set(admins.map((a) => a.signupId));

  const onChange = (value: string) => {
    setQuery(value);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await searchMembersAction({ query: value });
      if (res.ok) {
        setSuggestions(res.results.filter((r) => !existingIds.has(r.signupId)));
        setOpen(true);
      }
    }, 220);
  };

  const add = (s: MemberSuggestion) => {
    setOpen(false);
    setQuery("");
    setSuggestions([]);
    startTransition(async () => {
      const res = await addEventAdminAction({ eventId, signupId: s.signupId });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };

  const remove = (signupId: string) => {
    startTransition(async () => {
      const res = await removeEventAdminAction({ eventId, signupId });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        {admins.map((a) => (
          <li
            key={a.signupId}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/80"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400/20 text-[10px] font-semibold text-amber-300">
              {a.name.charAt(0).toUpperCase()}
            </span>
            {a.name}
            {a.isAuthor ? (
              <span className="text-white/40">· creator</span>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(a.signupId)}
                aria-label={`Remove ${a.name}`}
                className="text-white/40 transition hover:text-red-300 disabled:opacity-50"
              >
                <IconX className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="relative max-w-sm">
        <div className="flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-3 py-2">
          <IconPlus className="h-4 w-4 text-white/40" />
          <input
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="Add a co-organizer by name"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
        </div>
        {open && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl shadow-black/40">
            {suggestions.map((s) => (
              <li key={s.signupId}>
                <button
                  type="button"
                  onClick={() => add(s)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/5"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-400/20 text-xs font-semibold text-amber-300">
                    {s.name.charAt(0).toUpperCase()}
                  </span>
                  {s.name}
                  {s.isStudent && <span className="text-xs text-white/40">· student</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && query.trim().length >= 2 && suggestions.length === 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white/45 shadow-xl">
            No matching accounts.
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
