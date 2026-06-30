"use client";

import { useActionState, useState } from "react";
import {
  registerOAuthApp,
  rotateOAuthSecret,
  type RegisterState,
  type RotateState,
} from "./oauth-actions";
import { IconSparkles, IconCheck, IconCode } from "@/components/icons";

// The "Sign in with Pixel Parents" app-registration UI for the Developers tab.
// Register an app (name + redirect URIs + scopes) → reveal client_id + a one-time
// client_secret. Lists the caller's apps with a per-app rotate-secret control.

type LiveStatus = "live" | "pending" | "rejected";

type AppRow = {
  id: string;
  name: string;
  client_id: string;
  redirect_uris: string[];
  allowed_scopes: string[];
  secret_prefix: string | null;
  authorization_count: number;
  created_at: string;
  liveStatus: LiveStatus;
  reject_reason: string | null;
};

const SCOPES: { value: string; label: string; locked?: boolean; minor?: boolean }[] = [
  { value: "openid", label: "openid — sign-in (required)", locked: true },
  { value: "email", label: "email — the user's email address" },
  { value: "ohs_verified", label: "ohs_verified — signed verified-OHS assertion", minor: true },
  { value: "role", label: "role — parent, student, or alumni", minor: true },
  { value: "grade_band", label: "grade_band — middle/high (never the exact grade)", minor: true },
  { value: "family", label: "family — an anonymous, app-specific family id" },
];

function StatusBadge({ status }: { status: LiveStatus }) {
  const cls =
    status === "live"
      ? "border-emerald-500/40 text-emerald-300"
      : status === "rejected"
        ? "border-red-500/40 text-red-300"
        : "border-yellow-500/40 text-yellow-300";
  const label = status === "live" ? "Live" : status === "rejected" ? "Rejected" : "Pending review";
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${cls}`}>
      {label}
    </span>
  );
}

function CopyableSecret({ label, value, tone }: { label: string; value: string; tone: "id" | "secret" }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">{label}</span>
      <div className="flex items-center gap-2">
        <code
          className={`flex-1 overflow-x-auto rounded-md border px-3 py-2 font-mono text-xs ${
            tone === "secret"
              ? "border-amber-400/30 bg-amber-400/5 text-amber-200"
              : "border-white/10 bg-black/60 text-white/90"
          }`}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* user can copy manually */
            }
          }}
          className="shrink-0 rounded-md border border-white/15 px-2.5 py-2 text-xs text-white/70 hover:bg-white/5"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function RegisterForm() {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerOAuthApp, {});

  if (state.reveal) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-5">
        <p className="flex items-center gap-1.5 font-semibold text-emerald-300">
          <IconSparkles className="h-4 w-4" /> {state.reveal.name} is registered
        </p>
        <p className="text-sm text-white/70">
          Save the client secret now — it&apos;s shown only once. If you lose it, rotate it below.
        </p>
        <CopyableSecret label="Client ID" value={state.reveal.clientId} tone="id" />
        <CopyableSecret label="Client secret (shown once)" value={state.reveal.clientSecret} tone="secret" />
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-5">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-white/70">App name</span>
        <input
          name="name"
          required
          maxLength={120}
          placeholder="Cool OHS App"
          className="rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/35 focus:border-amber-400/60"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-white/70">Redirect URIs</span>
        <textarea
          name="redirect_uris"
          required
          rows={3}
          placeholder={"https://cool-ohs-app.com/callback\nhttp://localhost:3000/callback"}
          className="rounded-md border border-white/15 bg-black/40 px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-white/35 focus:border-amber-400/60"
        />
        <span className="text-xs text-white/40">
          One per line. Must be an exact match at sign-in (https only, or http://localhost for dev).
        </span>
      </label>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 text-white/70">Scopes this app may request</legend>
        {SCOPES.map((s) => (
          <label key={s.value} className="flex items-center gap-2.5 text-white/80">
            <input
              type="checkbox"
              name="scope"
              value={s.value}
              defaultChecked={s.locked || s.value === "ohs_verified"}
              disabled={s.locked}
              className="h-4 w-4 accent-amber-400"
            />
            <span className="font-mono text-xs">{s.label}</span>
            {s.minor ? (
              <span className="rounded-full border border-amber-400/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300/80">
                minor data
              </span>
            ) : null}
          </label>
        ))}
        <p className="mt-1 text-xs text-white/40">
          Apps that request scopes about OHS students (marked{" "}
          <span className="text-amber-300/80">minor data</span>) get extra review.
        </p>
      </fieldset>

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
      >
        {pending ? "Registering…" : "Register app"}
      </button>
    </form>
  );
}

function AppCard({ app }: { app: AppRow }) {
  const [state, action, pending] = useActionState<RotateState, FormData>(rotateOAuthSecret, {});
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-white">
            <IconCode className="h-4 w-4 text-amber-300" /> {app.name}
          </p>
          <code className="mt-1 block break-all font-mono text-xs text-white/55">{app.client_id}</code>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={app.liveStatus} />
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/50">
            {app.authorization_count} sign-in{app.authorization_count === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {app.liveStatus === "pending" ? (
        <p className="rounded-md border border-yellow-500/25 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-200/90">
          This app is pending approval — users can&apos;t sign in yet. It goes live
          automatically once your API access is approved, or once an admin approves the app.
        </p>
      ) : app.liveStatus === "rejected" ? (
        <p className="rounded-md border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-200/90">
          This app wasn&apos;t approved{app.reject_reason ? `: ${app.reject_reason}` : "."}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {app.allowed_scopes.map((s) => (
          <span key={s} className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] text-white/60">
            {s}
          </span>
        ))}
      </div>

      <div className="text-xs text-white/40">
        Redirects: {app.redirect_uris.join(", ") || "none"}
      </div>

      {state.reveal ? (
        <div className="flex flex-col gap-2 rounded-md border border-amber-400/30 bg-amber-400/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
            <IconCheck className="h-3.5 w-3.5" /> New secret — copy it now, shown once
          </p>
          <CopyableSecret label="Client secret" value={state.reveal.clientSecret} tone="secret" />
        </div>
      ) : (
        <form action={action}>
          <input type="hidden" name="id" value={app.id} />
          <input type="hidden" name="client_id" value={app.client_id} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/5 disabled:opacity-60"
          >
            {pending ? "Rotating…" : app.secret_prefix ? "Rotate secret" : "Generate secret"}
          </button>
        </form>
      )}
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
    </div>
  );
}

export function OAuthAppsPanel({
  apps,
  ownerApiApproved,
}: {
  apps: AppRow[];
  ownerApiApproved: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Sign in with Pixel Parents</h2>
        <p className="mt-1 text-sm text-white/55">
          Let another app sign users in with Pixel Parents and receive a signed
          assertion that they&apos;re a verified Stanford OHS student or parent
          (<code className="font-mono text-xs text-amber-200">ohs_verified</code>) —
          something Google, Apple, or GitHub can&apos;t provide.
        </p>
      </div>

      {!ownerApiApproved && (
        <p className="rounded-lg border border-yellow-500/25 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-200/90">
          New Sign-in apps stay <span className="font-semibold">pending</span> until your
          API access is approved (or an admin approves the app individually). Request API
          access above to activate your apps.
        </p>
      )}

      <RegisterForm />

      {apps.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">Your apps</h3>
          {apps.map((a) => (
            <AppCard key={a.id} app={a} />
          ))}
        </div>
      )}
    </div>
  );
}
