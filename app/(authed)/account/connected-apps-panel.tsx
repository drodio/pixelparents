"use client";

import { useActionState } from "react";
import {
  revokeConnectedApp,
  type ConnectedAppView,
  type RevokeState,
} from "./connected-apps-actions";
import { SCOPE_DESCRIPTIONS, type SupportedScope } from "@/lib/oauth/config";
import { IconCode, IconCheck } from "@/components/icons";

// The account-page "Connected apps" panel: every app the user authorized with
// "Sign in with GoPixel", what each can see (scopes, in plain language), and
// a Revoke button (revokes the grant + its refresh tokens). Repeat logins skip the
// consent screen until revoked here.

function plainScope(scope: string): string {
  return (
    SCOPE_DESCRIPTIONS[scope as SupportedScope] ?? scope
  );
}

function fmt(d: string | null): string {
  if (!d) return "never";
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AppRow({ app }: { app: ConnectedAppView }) {
  const [state, action, pending] = useActionState<RevokeState, FormData>(revokeConnectedApp, {});

  if (state.revoked) {
    return (
      <li className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-white/55">
        <IconCheck className="h-4 w-4 text-emerald-300" />
        Access for <span className="font-medium text-white/80">{app.name}</span> revoked.
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-white">
            <IconCode className="h-4 w-4 text-amber-300" /> {app.name}
          </p>
          <p className="mt-0.5 text-xs text-white/45">
            Authorized {fmt(app.authorizedAt)} · last used {fmt(app.lastUsedAt)}
          </p>
        </div>
        <form action={action} className="shrink-0">
          <input type="hidden" name="client_id" value={app.clientId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full border border-red-500/40 px-3.5 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
          >
            {pending ? "Revoking…" : "Revoke"}
          </button>
        </form>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
          This app can
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {app.scopes.map((s) => (
            <li key={s} className="flex items-start gap-2 text-sm text-white/75">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>{plainScope(s)}</span>
            </li>
          ))}
        </ul>
      </div>

      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
    </li>
  );
}

export function ConnectedAppsPanel({ apps }: { apps: ConnectedAppView[] }) {
  if (apps.length === 0) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/[0.02] p-5 text-sm text-white/45">
        You haven&apos;t signed in to any apps with GoPixel yet. When you do, they&apos;ll
        show up here and you can revoke their access anytime.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {apps.map((a) => (
        <AppRow key={a.clientId} app={a} />
      ))}
    </ul>
  );
}
