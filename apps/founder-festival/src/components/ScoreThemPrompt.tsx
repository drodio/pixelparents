// Shared "this person isn't on the Leaderboard yet" prompt.
//
// Rendered in two places when a name search finds no scored profile:
//   1. the global header search dropdown (HeaderSearch)
//   2. the leaderboard's own search empty state (LeaderboardTable)
//
// "Score them now" links to the homepage with the typed name pre-filled
// (`/?name=<encoded>`). The homepage (SplashForm) reads that param on load,
// opens the find-my-LinkedIn helper, and auto-runs the name search — so the
// visitor lands on LinkedIn candidates exactly as if they'd typed the name
// into the homepage helper themselves, then picks one to trigger scoring.
//
// Pure presentational component (no client hooks) so it can be dropped into
// either a client dropdown or a server-rendered table without ceremony.

import { scoreThemHref } from "@/lib/score-them";

type Props = {
  /** The name the visitor searched for (used verbatim in the copy + link). */
  name: string;
  className?: string;
};

export function ScoreThemPrompt({ name, className }: Props) {
  const trimmed = name.trim();
  const href = scoreThemHref(trimmed);
  return (
    <div className={className ?? "px-3 py-3 text-sm text-zinc-400 leading-relaxed"}>
      <span className="text-zinc-300">{trimmed}</span>{" "}
      isn&apos;t on our Leaderboard yet.{" "}
      <a href={href} className="link whitespace-nowrap">
        Score them now
      </a>
    </div>
  );
}
