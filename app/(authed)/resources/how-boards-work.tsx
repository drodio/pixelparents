import { IconLink, IconText, IconSparkles } from "@/components/icons";

const STEPS = [
  {
    Icon: IconSparkles,
    title: "A board is one topic",
    body: "Like “Choosing between OHS and other schools” or “AP Calculus BC study links.” Whoever starts a board can pin its most useful posts.",
  },
  {
    Icon: IconLink,
    title: "Anyone verified can add to it",
    body: "Add a link, upload a file, or write a note. Every verified OHS family can read and contribute.",
  },
  {
    Icon: IconText,
    title: "The most helpful rises to the top",
    body: "Upvotes sort the posts, and following a board tells you when something new is added.",
  },
] as const;

export function HowBoardsWork({ className = "" }: { className?: string }) {
  return (
    <section aria-label="How boards work" className={`grid gap-3 sm:grid-cols-3 ${className}`}>
      {STEPS.map(({ Icon, title, body }, i) => (
        <div key={title} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-400/15 text-xs font-semibold text-amber-300">
              {i + 1}
            </span>
            <Icon className="h-4 w-4 text-white/50" />
          </div>
          <p className="mt-2 text-sm font-semibold text-white/85">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">{body}</p>
        </div>
      ))}
    </section>
  );
}
