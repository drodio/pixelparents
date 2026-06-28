"use client";

import { useState } from "react";

// Email-invite form on /admin/access. Distinct from AddAdmin (which grants
// access to a user who already has a Clerk account). This sends a Resend
// email with a single-use link the recipient redeems after signing in with
// the invited email.
export function InviteAdmin({ roles }: { roles: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; expiresAt: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          roleId: roleId || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        email?: string;
        expiresAt?: string;
      };
      if (!res.ok || !json.ok) {
        const errCopy: Record<string, string> = {
          invalid_email: "That doesn't look like a valid email address.",
          invalid_role: "That role no longer exists.",
          forbidden: "You don't have permission to invite admins.",
          email_required: "Email is required.",
          inviter_email_missing: "Your account needs a verified email before you can invite others.",
        };
        setError(errCopy[json.error ?? ""] ?? json.error ?? `Failed (HTTP ${res.status})`);
        return;
      }
      setSent({ email: json.email!, expiresAt: json.expiresAt! });
      setEmail("");
      setRoleId("");
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
          setSent(null);
        }}
        className="self-start text-sm font-medium text-[#dfa43a] hover:text-[#c98e2a]"
      >
        {open ? "− Hide" : "+ Invite admin by email"}
      </button>

      {open && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500">
            Sends a Resend email to the address below with a single-use,
            14-day link. The recipient must sign in with the same email to
            redeem — the link is bound to that address.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="someone@example.com"
              className="flex-1 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 px-3 py-2 text-sm outline-none focus:border-zinc-500 min-w-0"
            />
            <select
              aria-label="Role"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 px-3 py-2 text-sm"
            >
              <option value="">— no role (full access) —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-black font-medium px-4 py-2 text-sm transition-colors disabled:opacity-40"
            >
              {busy ? "Sending…" : "Invite"}
            </button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {sent && (
            <p className="text-sm text-emerald-400">
              ✓ Invite sent to <strong>{sent.email}</strong>. Expires{" "}
              {new Date(sent.expiresAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              .
            </p>
          )}
        </form>
      )}
    </div>
  );
}
