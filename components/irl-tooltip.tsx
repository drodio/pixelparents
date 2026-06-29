// Inline "IRL" with an accessible hover/focus tooltip that explains the slang.
// CSS-only (group-hover / group-focus-within) so it works inside the public
// server-rendered pages without shipping any client JS. The word is keyboard
// focusable so the tooltip is reachable without a pointer.
export function IrlTooltip() {
  return (
    <span className="group relative inline-block">
      <code
        tabIndex={0}
        className="cursor-help rounded font-mono text-amber-400 underline decoration-dotted decoration-amber-400/60 underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
      >
        &quot;IRL&quot;
      </code>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 max-w-[80vw] -translate-x-1/2 rounded-lg border border-amber-400/30 bg-zinc-900 px-3 py-2 text-sm font-normal not-italic text-white/80 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        Psst parents:{" "}
        <code className="font-mono text-amber-400">IRL</code> is slang our kids
        use for <code className="font-mono text-amber-400">In Real Life</code>. We
        never needed to say &quot;IRL&quot; since our whole childhood was
        &quot;in real life!&quot;
      </span>
    </span>
  );
}
