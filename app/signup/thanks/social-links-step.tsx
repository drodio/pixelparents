"use client";

import { useState } from "react";
import { useAutoSave } from "@/lib/use-auto-save";
import { SaveStatus } from "@/components/save-status";
import { patchSignup, type SignupPatch } from "@/app/signup/actions";
import {
  IconPlus,
  IconX,
  IconLinkedin,
  IconGithub,
  IconMessage,
  IconInstagram,
  IconDiscord,
  IconGlobe,
} from "@/components/icons";

// The socials page of the onboarding wizard (V2 round 2). Ava's spec, verbatim
// intent: rather than stacking five labeled inputs, "a drop down to select
// which social media platform link they are adding, and then add more drop
// downs as necessary."
//
// Each platform maps to the field the rest of the app already reads:
//   linkedin  → linkedinHandle   (stored as linkedinUrl)
//   github    → githubUsername
//   wechat    → wechatId
//   instagram → instagramHandle  (extra jsonb — NEW)
//   x         → xHandle          (extra jsonb — NEW)
// Removing a row clears the field (empty string → the sanitizer nulls it).

type PlatformKey =
  | "linkedin"
  | "github"
  | "wechat"
  | "instagram"
  | "x"
  | "discord"
  | "website";

const PLATFORMS: {
  key: PlatformKey;
  label: string;
  prefix: string;
  placeholder: string;
  // Round 6: every row shows its platform's logo, not just the name.
  Icon: (p: { className?: string }) => React.ReactElement;
  patchKey: keyof SignupPatch &
    (
      | "linkedinHandle"
      | "githubUsername"
      | "wechatId"
      | "instagramHandle"
      | "xHandle"
      | "discordHandle"
      | "websiteUrl"
    );
}[] = [
  { key: "linkedin", label: "LinkedIn", prefix: "linkedin.com/in/", placeholder: "your-handle", Icon: IconLinkedin, patchKey: "linkedinHandle" },
  { key: "github", label: "GitHub", prefix: "github.com/", placeholder: "username", Icon: IconGithub, patchKey: "githubUsername" },
  { key: "wechat", label: "WeChat", prefix: "ID:", placeholder: "your-wechat-id", Icon: IconMessage, patchKey: "wechatId" },
  { key: "instagram", label: "Instagram", prefix: "instagram.com/", placeholder: "username", Icon: IconInstagram, patchKey: "instagramHandle" },
  { key: "x", label: "X", prefix: "x.com/", placeholder: "username", Icon: IconX, patchKey: "xHandle" },
  // Round 6: Discord joins the adder. Username only — bare Discord usernames
  // have no public profile URL, so the profile shows a chip, not a link.
  { key: "discord", label: "Discord", prefix: "@", placeholder: "username", Icon: IconDiscord, patchKey: "discordHandle" },
  // Round 5: personal website. Full URL, not a handle — the sanitizer
  // normalizes it (extra.websiteUrl, already on profiles behind the same
  // "links" share opt-in).
  { key: "website", label: "Personal Website", prefix: "", placeholder: "https://yourname.com", Icon: IconGlobe, patchKey: "websiteUrl" },
];

const selectCls =
  "rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-sm text-white outline-none focus:border-amber-400/60";
const inputCls =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-amber-400/60";

export function StepSocialLinks({
  signupId,
  initial,
}: {
  signupId: string;
  // Current values keyed by platform; empty string = not set.
  initial: Record<PlatformKey, string>;
}) {
  // One row per platform that already has a value; one empty row to start with
  // otherwise, so the page opens ready to type rather than with a bare button.
  const [rows, setRows] = useState<{ platform: PlatformKey; value: string }[]>(() => {
    const filled = PLATFORMS.filter((p) => initial[p.key]).map((p) => ({
      platform: p.key,
      value: initial[p.key],
    }));
    return filled.length > 0 ? filled : [{ platform: "linkedin", value: "" }];
  });

  const { queue, status } = useAutoSave<SignupPatch>(async (patch) => {
    const r = await patchSignup(signupId, patch);
    if (!r.ok) throw new Error("save failed");
  });

  const used = new Set(rows.map((r) => r.platform));

  function setRow(i: number, next: { platform: PlatformKey; value: string }) {
    const prev = rows[i]!;
    const nextRows = rows.map((r, j) => (j === i ? next : r));
    setRows(nextRows);
    if (prev.platform !== next.platform && prev.value) {
      // Platform changed on a filled row: clear the old field, save the new.
      queue({ [PLATFORMS.find((p) => p.key === prev.platform)!.patchKey]: "" }, true);
    }
    queue({ [PLATFORMS.find((p) => p.key === next.platform)!.patchKey]: next.value });
  }

  function removeRow(i: number) {
    const row = rows[i]!;
    setRows(rows.filter((_, j) => j !== i));
    if (row.value) {
      queue({ [PLATFORMS.find((p) => p.key === row.platform)!.patchKey]: "" }, true);
    }
  }

  function addRow() {
    const free = PLATFORMS.find((p) => !used.has(p.key));
    if (free) setRows([...rows, { platform: free.key, value: "" }]);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-white/55">
        Add the ones you use — each is optional, and you choose later whether any
        of them show in the directory.
      </p>
      {rows.map((row, i) => {
        const meta = PLATFORMS.find((p) => p.key === row.platform)!;
        return (
          <div key={i} className="flex items-center gap-2">
            {/* The row's platform logo tracks the dropdown selection. */}
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5 text-white/70">
              <meta.Icon className="h-5 w-5" />
            </span>
            <select
              aria-label="Platform"
              value={row.platform}
              onChange={(e) => setRow(i, { platform: e.target.value as PlatformKey, value: row.value })}
              className={selectCls}
            >
              {PLATFORMS.filter((p) => p.key === row.platform || !used.has(p.key)).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <div className="flex min-w-0 flex-1 items-center rounded-lg border border-white/15 bg-white/5 focus-within:border-amber-400/60">
              <span className="hidden shrink-0 pl-3 text-sm text-white/35 sm:inline">{meta.prefix}</span>
              <input
                aria-label={`${meta.label} handle`}
                value={row.value}
                onChange={(e) => setRow(i, { platform: row.platform, value: e.target.value })}
                placeholder={meta.placeholder}
                className={`${inputCls} border-0 bg-transparent focus:border-0`}
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label={`Remove ${meta.label}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      {rows.length < PLATFORMS.length && (
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <IconPlus className="h-4 w-4" /> Add another link
        </button>
      )}
      <SaveStatus status={status} />
    </div>
  );
}
