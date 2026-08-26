"use client";

import { useState, useTransition } from "react";
import { inviteStudent, type InvitedStudent } from "./actions";
import { formatPhone } from "@/lib/phone";
import { IconCircleCheck } from "@/components/icons";

// The END-of-onboarding "Add your student" step (round 3, Aug 17): the parent
// enters ONLY name + OHS email (+ optional phone). The student gets an email
// and completes their own profile through their own onboarding — already
// linked to this family. Everything deeper (interests, photos, settings) is
// deliberately not collectable here: "adding a child should not be the
// parent's responsibility to fill in."

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-amber-400/60";

export function StudentInviteStep({
  signupId,
  initialInvited,
}: {
  signupId: string;
  initialInvited: InvitedStudent[];
}) {
  const [invited, setInvited] = useState<InvitedStudent[]>(initialInvited);
  const [v, setV] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setNote(null);
    start(async () => {
      const r = await inviteStudent(signupId, v);
      setNote({ ok: r.ok, text: r.message });
      if (r.ok && r.student) {
        setInvited((prev) =>
          prev.some((s) => s.id === r.student!.id) ? prev : [...prev, r.student!],
        );
        setV({ firstName: "", lastName: "", email: "", phone: "" });
      }
    });
  }

  const canSubmit =
    v.firstName.trim() && v.lastName.trim() && v.email.trim() && !pending;

  return (
    <div className="flex flex-col gap-5">
      {invited.length > 0 && (
        <ul className="flex flex-col gap-2">
          {invited.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] px-3 py-2 text-sm text-white/80"
            >
              <IconCircleCheck className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="min-w-0 truncate">
                <span className="font-medium text-white">{s.firstName}</span> — invited at{" "}
                {s.email}. They&apos;ll finish their own profile.
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="inv-first">
            Student&apos;s first name
          </label>
          <input
            id="inv-first"
            value={v.firstName}
            onChange={(e) => setV((p) => ({ ...p, firstName: e.target.value }))}
            className={inputCls}
            autoComplete="off"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="inv-last">
            Last name
          </label>
          <input
            id="inv-last"
            value={v.lastName}
            onChange={(e) => setV((p) => ({ ...p, lastName: e.target.value }))}
            className={inputCls}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="inv-email">
            Their OHS email
          </label>
          <input
            id="inv-email"
            type="email"
            inputMode="email"
            value={v.email}
            onChange={(e) => setV((p) => ({ ...p, email: e.target.value }))}
            placeholder="name@ohs.stanford.edu"
            className={inputCls}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-white/45">
            The invite goes here, and it&apos;s the address they&apos;ll verify with.
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor="inv-phone">
            Phone <span className="font-normal text-white/40">(optional)</span>
          </label>
          <input
            id="inv-phone"
            type="tel"
            value={v.phone}
            onChange={(e) => setV((p) => ({ ...p, phone: e.target.value }))}
            onBlur={() => {
              const f = formatPhone(v.phone);
              if (f !== v.phone) setV((p) => ({ ...p, phone: f }));
            }}
            className={inputCls}
            autoComplete="off"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="self-start rounded-full bg-amber-400 px-6 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-40"
      >
        {pending ? "Sending…" : "Send invite"}
      </button>

      {note && (
        <p className={`text-sm ${note.ok ? "text-emerald-300/90" : "text-red-400"}`} aria-live="polite">
          {note.text}
        </p>
      )}
    </div>
  );
}
