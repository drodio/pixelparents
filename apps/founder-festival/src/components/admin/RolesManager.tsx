"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Grant = { key: string; label: string; category: string };
type Scope = "all" | "theirs";
type Role = {
  id: string;
  name: string;
  grants: string[];
  costMultiplier: number;
  usersScope: Scope;
  eventsScope: Scope;
};

// Categories that carry an All/Only-Theirs scope. "admin" is super-admin
// territory — no scope.
const GRANT_CATEGORIES: { key: string; label: string; scoped: boolean }[] = [
  { key: "users", label: "Users", scoped: true },
  { key: "events", label: "Events", scoped: true },
  { key: "admin", label: "Admin (super-admin)", scoped: false },
];

// Segmented [ All | Only Theirs ] toggle for a scoped category.
function ScopeToggle({ value, onChange }: { value: Scope; onChange: (s: Scope) => void }) {
  return (
    <div className="inline-flex rounded-md border border-zinc-700 overflow-hidden text-[11px]">
      {(["all", "theirs"] as Scope[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`px-2 py-0.5 transition-colors ${
            value === s ? "bg-[#dfa43a] text-black font-semibold" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {s === "all" ? "All" : "Only Theirs"}
        </button>
      ))}
    </div>
  );
}

// Grant checkboxes grouped into Users / Events / Admin categories. Scoped
// categories (Users, Events) show an All/Only-Theirs toggle in their header.
function GrantCheckboxes({
  grantCatalog,
  selected,
  onToggle,
  scopes,
  onScopeChange,
}: {
  grantCatalog: Grant[];
  selected: string[];
  onToggle: (key: string) => void;
  scopes: { users: Scope; events: Scope };
  onScopeChange: (category: "users" | "events", scope: Scope) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {GRANT_CATEGORIES.map((cat) => {
        const items = grantCatalog.filter((g) => g.category === cat.key);
        if (items.length === 0) return null;
        return (
          <div key={cat.key} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <div className="text-xs uppercase tracking-[0.15em] text-zinc-500">{cat.label}</div>
              {cat.scoped && (
                <ScopeToggle
                  value={scopes[cat.key as "users" | "events"]}
                  onChange={(s) => onScopeChange(cat.key as "users" | "events", s)}
                />
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {items.map((g) => (
                <label key={g.key} className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={selected.includes(g.key)} onChange={() => onToggle(g.key)} />
                  {g.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RolesManager({ roles, grantCatalog }: { roles: Role[]; grantCatalog: Grant[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGrants, setNewGrants] = useState<string[]>([]);
  const [newCostMultiplier, setNewCostMultiplier] = useState(10);
  const [newUsersScope, setNewUsersScope] = useState<Scope>("all");
  const [newEventsScope, setNewEventsScope] = useState<Scope>("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [editGrants, setEditGrants] = useState<string[]>([]);
  const [editCostMultiplier, setEditCostMultiplier] = useState(10);
  const [editUsersScope, setEditUsersScope] = useState<Scope>("all");
  const [editEventsScope, setEditEventsScope] = useState<Scope>("all");

  function toggle(list: string[], key: string): string[] {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  }

  async function create() {
    if (!newName.trim()) { setError("Name is required."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          grants: newGrants,
          costMultiplier: newCostMultiplier,
          usersScope: newUsersScope,
          eventsScope: newEventsScope,
        }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || `Failed (HTTP ${res.status})`); return; }
      setNewName(""); setNewGrants([]); setNewCostMultiplier(10);
      setNewUsersScope("all"); setNewEventsScope("all"); router.refresh();
    } catch { setError("Network error."); } finally { setBusy(false); }
  }

  async function saveEdit(id: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/roles/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grants: editGrants,
          costMultiplier: editCostMultiplier,
          usersScope: editUsersScope,
          eventsScope: editEventsScope,
        }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || `Failed (HTTP ${res.status})`); return; }
      setEditId(null); router.refresh();
    } catch { setError("Network error."); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this role?")) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/roles/${id}`, { method: "DELETE" });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || `Failed (HTTP ${res.status})`); return; }
      router.refresh();
    } catch { setError("Network error."); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">New role</h2>
        {/* w-full so the input fills (and never exceeds) a narrow viewport; max-w-xs still caps it on wider screens */}
        <input
          value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Role name (e.g. Vendor)"
          className="w-full max-w-xs rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <GrantCheckboxes
          grantCatalog={grantCatalog}
          selected={newGrants}
          onToggle={(k) => setNewGrants((s) => toggle(s, k))}
          scopes={{ users: newUsersScope, events: newEventsScope }}
          onScopeChange={(c, s) => (c === "users" ? setNewUsersScope(s) : setNewEventsScope(s))}
        />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          Cost multiplier
          <input
            type="number"
            min={1}
            value={newCostMultiplier}
            onChange={(e) => setNewCostMultiplier(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
            className="w-20 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 px-2 py-1 text-sm outline-none focus:border-zinc-500"
          />
          <span className="text-zinc-600 text-xs">× costs (default 10, min 1)</span>
        </label>
        <button type="button" disabled={busy} onClick={create}
          className="self-start rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-5 py-2 text-sm disabled:opacity-40">
          Create role
        </button>
      </div>

      {roles.length === 0 ? (
        <p className="text-zinc-500 text-sm">No roles yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {roles.map((r) => (
            <div key={r.id} className="rounded-md border border-zinc-800 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-100 font-medium">
                  {r.name}
                  <span className="text-zinc-500 text-xs ml-2 font-normal">×{r.costMultiplier} cost</span>
                  {r.usersScope === "theirs" && (
                    <span className="text-[#dfa43a] text-[11px] ml-2 font-normal">Users: only theirs</span>
                  )}
                  {r.eventsScope === "theirs" && (
                    <span className="text-[#dfa43a] text-[11px] ml-2 font-normal">Events: only theirs</span>
                  )}
                </span>
                <div className="flex gap-2">
                  <button type="button" disabled={busy}
                    onClick={() => { setEditId(editId === r.id ? null : r.id); setEditGrants(r.grants); setEditCostMultiplier(r.costMultiplier); setEditUsersScope(r.usersScope); setEditEventsScope(r.eventsScope); }}
                    className="rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-3 py-1 text-xs">
                    {editId === r.id ? "Cancel" : "Edit"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => remove(r.id)}
                    className="rounded border border-zinc-700 hover:border-red-700 text-zinc-400 hover:text-red-300 px-3 py-1 text-xs">
                    Delete
                  </button>
                </div>
              </div>
              {editId === r.id ? (
                <div className="flex flex-col gap-2">
                  <GrantCheckboxes
                    grantCatalog={grantCatalog}
                    selected={editGrants}
                    onToggle={(k) => setEditGrants((s) => toggle(s, k))}
                    scopes={{ users: editUsersScope, events: editEventsScope }}
                    onScopeChange={(c, s) => (c === "users" ? setEditUsersScope(s) : setEditEventsScope(s))}
                  />
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    Cost multiplier
                    <input
                      type="number"
                      min={1}
                      value={editCostMultiplier}
                      onChange={(e) => setEditCostMultiplier(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                      className="w-20 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 px-2 py-1 text-sm outline-none focus:border-zinc-500"
                    />
                  </label>
                  <button type="button" disabled={busy} onClick={() => saveEdit(r.id)}
                    className="self-start rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-4 py-1.5 text-xs disabled:opacity-40">
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {r.grants.length === 0 ? (
                    <span className="text-zinc-600 text-xs">no grants</span>
                  ) : (
                    r.grants.map((g) => (
                      <span key={g} className="px-2 py-0.5 rounded-md border border-zinc-700 text-zinc-400 text-[11px]">
                        {grantCatalog.find((c) => c.key === g)?.label ?? g}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
