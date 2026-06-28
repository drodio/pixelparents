"use client";

import { MentionChipInput } from "@/components/MentionChipInput";

// Single-line photo-caption input with @-mention autocomplete. Mentions render
// as atomic GOLD chips (no leading "@", never wrap) via the shared TipTap chip
// editor. Reports the SERIALIZED caption ("@[Name](evalId)") via onChange.
// Mount-initialized from `initial` — to push an external change (e.g. an AI
// caption), remount it with a changed React `key`.
export function CaptionMentionInput({
  initial,
  onChange,
  placeholder,
  inputClassName,
}: {
  initial: string;
  onChange: (serialized: string) => void;
  placeholder?: string;
  inputClassName?: string;
}) {
  return (
    <MentionChipInput
      singleLine
      initialBody={initial}
      onBody={onChange}
      placeholder={placeholder ?? "Caption — @ to mention"}
      className={
        inputClassName ??
        "w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-400 whitespace-nowrap overflow-x-auto"
      }
    />
  );
}
