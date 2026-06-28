"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ClerkUser = {
  id: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  alreadyAdmin: boolean;
};

// Proactively grant admin to an existing Clerk user. Collapsed behind a "+ Add
// admin" toggle (so the page doesn't load Clerk users until needed). Open it to
// browse all users (newest first, "Load more") or search by name/email, pick a
// role, and Add → POST /api/admin/access/grant, then refresh the table below.
export function AddAdmin({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<ClerkUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleByUser, setRoleByUser] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());

  const fetchUsers = useCallback(
    async (query: string, offset: number, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/clerk-users?q=${encodeURIComponent(query)}&offset=${offset}`,
        );
        if (!res.ok) {
          setError(`Could not load users (HTTP ${res.status})`);
          return;
        }
        const json = (await res.json()) as {
          users: ClerkUser[];
          hasMore: boolean;
          nextOffset: number | null;
        };
        setUsers((prev) => (append ? [...prev, ...json.users] : json.users));
        setHasMore(!!json.hasMore);
        setNextOffset(json.nextOffset ?? 0);
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Load on open + debounced re-fetch as the search query changes.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => fetchUsers(q, 0, false), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, open, fetchUsers]);

  async function grant(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/access/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId: id, roleId: roleByUser[id] || undefined }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || `Failed (HTTP ${res.status})`);
        return;
      }
      setGrantedIds((s) => new Set(s).add(id));
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="self-start text-sm font-medium text-[#dfa43a] hover:text-[#c98e2a]"
      >
        {open ? "− Hide" : "+ Add admin"}
      </button>

      {open && (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all users by name or email…"
            className="w-full max-w-md rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex flex-col divide-y divide-zinc-900 border border-zinc-800 rounded-md max-h-96 overflow-y-auto">
            {users.map((u) => {
              const isAdmin = u.alreadyAdmin || grantedIds.has(u.id);
              return (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-100 truncate">{u.name ?? "—"}</div>
                    <div className="text-xs text-zinc-500 truncate">{u.email ?? "—"}</div>
                  </div>
                  {isAdmin ? (
                    <span className="text-emerald-400 text-xs shrink-0">✓ admin</span>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        aria-label="Role"
                        value={roleByUser[u.id] ?? ""}
                        onChange={(e) =>
                          setRoleByUser((prev) => ({ ...prev, [u.id]: e.target.value }))
                        }
                        className="rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 px-2 py-1 text-xs"
                      >
                        <option value="">— no role (full access) —</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => grant(u.id)}
                        className="rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-black font-medium px-3 py-1 text-xs transition-colors disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {loading && <p className="px-3 py-2 text-zinc-500 text-xs">Loading…</p>}
            {!loading && users.length === 0 && (
              <p className="px-3 py-2 text-zinc-500 text-xs">No users found.</p>
            )}
          </div>

          {hasMore && !q && (
            <button
              type="button"
              disabled={loading}
              onClick={() => fetchUsers(q, nextOffset, true)}
              className="self-start rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-3 py-1 text-xs disabled:opacity-40"
            >
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
