import { VISIBILITY_LABEL, type ChatVisibility } from "@/lib/event-chat-shared";

// Small pill showing a thread's visibility. Gold = the gated levels (members /
// attendees), neutral = public.
export function VisibilityPill({ visibility }: { visibility: ChatVisibility }) {
  const gated = visibility !== "public";
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${
        gated ? "bg-[#dfa43a] text-black" : "border border-zinc-700 text-zinc-400"
      }`}
    >
      {VISIBILITY_LABEL[visibility]}
    </span>
  );
}
