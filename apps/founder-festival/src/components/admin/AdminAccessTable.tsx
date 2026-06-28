"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AccessRow = {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  status: string;
  requestedAt: string;
  decidedByEmail: string | null;
  roleId: string | null;
  roleName: string | null;
};

// Lists admin-access rows; pending rows get a role <select> + Approve/Deny
// buttons that hit the grant-gated decision route, then refresh the server
// component. Approved rows show their role (or "no role — no access") with an
// Edit Role control (PATCH /api/admin/access/[id]) and a Delete button.
export function AdminAccessTable({
  rows,
  roles,
}: {
  rows: AccessRow[];
  roles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // rowId → chosen roleId ("" = no role / no access). Only used on approve.
  const [roleByRow, setRoleByRow] = useState<Record<string, string>>({});
  // Approved-row "Edit Role" inline editor: which row + its chosen roleId.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRoleVal, setEditRoleVal] = useState("");

  async function saveRole(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/access/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: editRoleVal || null }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || `Failed (HTTP ${res.status})`);
        return;
      }
      setEditingId(null);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function decide(id: string, decision: "approved" | "denied") {
    setBusyId(id);
    setError(null);
    const roleId = roleByRow[id] || undefined;
    try {
      const res = await fetch(`/api/admin/access/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, roleId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || `Action failed (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  // Revoke a previously-approved (or denied) entry: hard-deletes the row so the
  // person is no longer an admin. They can request access again later.
  async function remove(id: string) {
    if (
      !window.confirm(
        "Delete this admin? They will lose admin access immediately. They can request it again later.",
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/access/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || `Delete failed (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-zinc-500 text-sm">No access requests yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="border border-zinc-800 rounded-md overflow-hidden">
        {/* The Actions cell (role <select> + 2-3 buttons) is wide; scroll the
            whole table inside its box so it can't blow out 390px width. */}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">User</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-800">
                <td className="px-4 py-3">
                  <div className="text-zinc-100">{r.name ?? "—"}</div>
                  <div className="text-zinc-500 text-xs">{r.email ?? "—"}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={r.status} />
                  {r.status === "approved" && (
                    <span className="block text-[10px] text-zinc-500 mt-0.5">
                      {r.roleName ?? "no role — no access"}
                    </span>
                  )}
                  {r.decidedByEmail && (
                    <span className="block text-[10px] text-zinc-600 mt-0.5">
                      by {r.decidedByEmail}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.status === "pending" ? (
                    // flex-wrap so the select + Approve/Deny stack instead of
                    // overflowing the Actions cell on a narrow phone.
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <select
                        aria-label="Role"
                        disabled={busyId === r.id}
                        value={roleByRow[r.id] ?? ""}
                        onChange={(e) =>
                          setRoleByRow((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        className="w-full sm:w-auto rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 px-2 py-1.5 text-xs disabled:opacity-40"
                      >
                        <option value="">— no role (no access) —</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => decide(r.id, "approved")}
                        className="rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-black font-medium px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => decide(r.id, "denied")}
                        className="rounded-md border border-zinc-700 hover:border-red-700 text-zinc-300 hover:text-red-300 px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
                      >
                        Deny
                      </button>
                    </div>
                  ) : (
                    // flex-wrap so the role editor / Edit-Delete buttons stack
                    // rather than overflow the Actions cell on a narrow phone.
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {editingId === r.id ? (
                        <>
                          <select
                            aria-label="Role"
                            disabled={busyId === r.id}
                            value={editRoleVal}
                            onChange={(e) => setEditRoleVal(e.target.value)}
                            className="w-full sm:w-auto rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 px-2 py-1.5 text-xs disabled:opacity-40"
                          >
                            <option value="">— no role (no access) —</option>
                            {roles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => saveRole(r.id)}
                            className="rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <a
                            href={`/admin/access/${r.id}`}
                            className="rounded-md border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-3 py-1.5 text-xs transition-colors"
                          >
                            Edit
                          </a>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => {
                              setEditingId(r.id);
                              setEditRoleVal(r.roleId ?? "");
                            }}
                            className="rounded-md border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
                          >
                            Edit Role
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => remove(r.id)}
                            className="rounded-md border border-zinc-700 hover:border-red-700 text-zinc-400 hover:text-red-300 px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "approved"
      ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
      : status === "denied"
        ? "text-red-400 border-red-400/30 bg-red-400/10"
        : "text-amber-400 border-amber-400/30 bg-amber-400/10";
  return (
    <span className={`px-2 py-0.5 rounded-md border text-xs ${color}`}>
      {status}
    </span>
  );
}
