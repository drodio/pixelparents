import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import Markdown from "./markdown";
import InterestTiles from "../signup/interest-tiles";
import { PixelMascot } from "@/components/pixel-mascot";
import { getInterestPool } from "@/lib/interests";

export const metadata = {
  title: "Builder Guidelines — GoPixel",
  description:
    "How GoPixel tech builders work together: a high-trust, open-source, learn-by-shipping community of OHS parents building software for our kids — protecting PII and using AI safely.",
};

// Live interest pool drives the jigsaw strip.
export const dynamic = "force-dynamic";

// builders.md lives at the repo root so it's easy to find and edit in the open
// source repo. Read at build time and rendered as the page below.
const source = readFileSync(join(process.cwd(), "builders.md"), "utf8");

// Shared link styling matching the builders page accent (amber, dotted underline).
const linkClass =
  "text-inherit underline decoration-dotted decoration-amber-400 underline-offset-2 transition-colors hover:decoration-amber-300";

// Code block styling lifted from the /developers page so the two pages match.
const preClass =
  "overflow-x-auto rounded-lg border border-white/10 bg-black/60 p-4 font-mono text-xs leading-relaxed text-white/80";

const REPO_URL = "https://github.com/drodio/pixelparents";

// Optional WhatsApp link (a wa.me URL set via NEXT_PUBLIC_DRODIO_WHATSAPP_URL).
// No phone number is committed to this public repo — absent → generic copy.
const WHATSAPP_URL = process.env.NEXT_PUBLIC_DRODIO_WHATSAPP_URL;

export default async function BuildersPage() {
  let interests: string[] = [];
  try {
    interests = await getInterestPool();
  } catch {
    interests = [];
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-black px-6 py-16 text-white sm:py-24">
      <InterestTiles interests={interests} variant="strip" />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-10">
        <header className="flex flex-col items-center gap-6 text-center">
          <PixelMascot widthClass="w-24" href="/" />
          <div className="flex flex-col gap-4">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Anyone can be a builder
            </h1>
            <p className="mx-auto max-w-xl text-lg leading-relaxed text-white/70">
              GoPixel is a warm, low-pressure place for OHS parents and
              students to learn to build software together — even if you have
              never written a line of code. If you are curious, you already
              belong here.
            </p>
          </div>
        </header>

        {/* Welcoming on-ramp — speaks to the curious-but-tentative first, before
            the formal builder guidelines below. This block is intentionally JSX
            (not builders.md) so the guidelines doc stays a clean, ratified policy
            artifact while the page can carry the warmer, evolving on-ramp. */}
        <section
          id="start-here"
          className="flex scroll-mt-24 flex-col gap-6 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-6 sm:p-8"
        >
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-amber-400">
              New to building? Start here
            </span>
            <h2 className="text-2xl font-bold">
              You don&apos;t have to be a &ldquo;builder&rdquo; to build
            </h2>
          </div>

          <p className="text-base leading-relaxed text-white/70">
            If the word &ldquo;builder&rdquo; feels like it belongs to someone
            else — engineers, computer-science people, your kid — read this part
            first. The truth is that building software has quietly become
            something you can do by describing what you want in plain English.
            That&apos;s what people mean by <em className="text-white/50">vibe
            coding</em>: you talk to an AI assistant, it writes and runs the
            code, and you steer. The barrier that kept most people out is gone.
          </p>

          <p className="text-base leading-relaxed text-white/70">
            So this is a safe place to be a beginner. You can lurk, ask
            &ldquo;obvious&rdquo; questions, break things, and learn out loud.
            Nobody here expects you to already know how — that&apos;s the whole
            point of doing it together.
          </p>

          <div className="flex flex-col gap-3">
            <h3 className="font-semibold text-white">
              Your zero-to-first-change path
            </h3>
            <ol className="flex flex-col gap-3">
              {[
                [
                  "Get the tools",
                  <>
                    Install{" "}
                    <a href="https://claude.ai/download" className={linkClass}>
                      the Claude desktop app
                    </a>{" "}
                    (or{" "}
                    <a
                      href="https://www.anthropic.com/claude-code"
                      className={linkClass}
                    >
                      Claude Code
                    </a>{" "}
                    in a terminal). This is the AI assistant that will do the
                    typing while you describe what you want.
                  </>,
                ],
                [
                  "Open this project",
                  <>
                    Everything we build is open source. Point Claude at{" "}
                    <a href={REPO_URL} className={linkClass}>
                      our repo
                    </a>{" "}
                    and ask it to explain what the project does — there&apos;s a
                    copy-paste starter prompt in{" "}
                    <a href="#getting-started" className={linkClass}>
                      Getting started
                    </a>{" "}
                    below.
                  </>,
                ],
                [
                  "Make one small change",
                  <>
                    Fix a typo, tweak some wording, adjust a color. Ask the
                    assistant to make the change and show you the result. That
                    first small win is the moment building stops feeling
                    mysterious.
                  </>,
                ],
                [
                  "Open your first pull request",
                  <>
                    A pull request (PR) is just &ldquo;here&apos;s a change I
                    made, please consider it.&rdquo; Ask Claude to open one for
                    you and walk you through it. We review PRs kindly — a first
                    PR is a milestone, not a test.
                  </>,
                ],
              ].map(([title, body], i) => (
                <li
                  key={i}
                  className="flex gap-4 rounded-xl border border-white/10 bg-black/30 p-4"
                >
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-amber-400/40 text-sm font-semibold text-amber-400">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-white">{title}</span>
                    <span className="text-base leading-relaxed text-white/70">
                      {body}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <p className="text-sm text-white/50">
            Stuck at any step? That&apos;s expected. Bring it to the WhatsApp
            group or ask the AI assistant itself — &ldquo;explain this to me like
            I&apos;ve never done it before&rdquo; is a perfectly good prompt.
          </p>
        </section>

        {/* Why learning to build matters now — the AI shift. */}
        <section id="why-now" className="flex scroll-mt-24 flex-col gap-5">
          <h2 className="text-2xl font-bold">Why this matters now</h2>
          <p className="text-base leading-relaxed text-white/70">
            The way we work is changing fast. AI has turned building software
            from a specialist skill into something anyone curious can pick up —
            and that shift is reshaping nearly every job our kids will graduate
            into. Learning to build today isn&apos;t about becoming a software
            engineer. It&apos;s about becoming fluent in the tools that are
            quickly becoming the baseline for how things get made.
          </p>
          <p className="text-base leading-relaxed text-white/70">
            For parents, that fluency is the best way to understand the world
            our children are heading into — and to guide them through it well.
            For students, it&apos;s a head start on a way of working that will be
            second nature by the time they leave OHS. We build together so we can
            all be power users of these tools, not bystanders to them.
          </p>
        </section>

        {/* Two clear tracks: parents mentor, students start. */}
        <section id="two-ways-in" className="flex scroll-mt-24 flex-col gap-5">
          <h2 className="text-2xl font-bold">Two ways in</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="font-semibold text-white">Parents: start &amp; mentor</h3>
              <p className="text-base leading-relaxed text-white/70">
                Join as a builder yourself, at any experience level — most of us
                are learning as we go. Once you&apos;re comfortable, the most
                valuable thing you can do is mentor a student: every student
                builder needs at least one parent building alongside them. You
                don&apos;t need to be the expert in the room; you need to be the
                steady adult who&apos;s learning together with them.
              </p>
              <p className="text-sm text-white/50">
                <a href="#how-to-get-involved-as-a-pixel-parent-builder" className={linkClass}>
                  How to get involved →
                </a>
              </p>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="font-semibold text-white">Students: start building</h3>
              <p className="text-base leading-relaxed text-white/70">
                If you&apos;re an OHS student who wants to build, you&apos;re
                exactly who we hope to see. Pick something real, build it, ship
                it, and learn from what breaks — with a parent mentor alongside
                you. AI-assisted coding does the heavy lifting, so curiosity and
                a willingness to iterate are all you need to start.
              </p>
              <p className="text-sm text-white/50">
                <a href="#student-builders" className={linkClass}>
                  Student builders →
                </a>
              </p>
            </div>
          </div>
        </section>

        <div className="border-t border-white/10" />

        <p className="text-sm uppercase tracking-wide text-white/40">
          The fine print — how we work together
        </p>

        <article className="flex flex-col gap-6">
          <Markdown content={source} />
        </article>

        {/* Visual divider before the student-builders + getting-started sections. */}
        <div className="border-t border-white/10" />

        <section
          id="student-builders"
          className="flex scroll-mt-24 flex-col gap-5"
        >
          <h2 className="text-2xl font-bold">Student builders</h2>

          <p className="text-base leading-relaxed text-white/70">
            A{" "}
            <strong className="font-semibold text-white/80">student builder</strong>{" "}
            is an OHS student who builds software alongside us. We are a{" "}
            <em className="not-italic text-white/50">learn by shipping</em>{" "}
            community: the fastest way to learn is to pick something real, build it,
            ship it, and learn from what breaks. You do not need to be an experienced
            engineer — curiosity and a willingness to iterate are enough, and
            AI-assisted coding does the heavy lifting.
          </p>

          <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-5">
            <h3 className="font-semibold text-white">
              Every student builder needs a parent mentor
            </h3>
            <p className="mt-1.5 text-base leading-relaxed text-white/70">
              This is a policy, not a suggestion: every student builder must have at
              least one parent mentor building alongside them. The mentor can be the
              student&apos;s own parent, or another current OHS parent who has
              volunteered and has the approval of the student&apos;s parent.
            </p>
            <p className="mt-3 text-base leading-relaxed text-white/70">
              Need help finding a mentor?{" "}
              {WHATSAPP_URL ? (
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  Message Daniel (&ldquo;DROdio&rdquo;) on WhatsApp
                </a>
              ) : (
                <>message Daniel (&ldquo;DROdio&rdquo;) on WhatsApp</>
              )}{" "}
              to get paired with one.
            </p>
          </div>

          <p className="text-base leading-relaxed text-white/70">
            Everything we build is open source. Browse the code, open issues, and send
            pull requests at{" "}
            <a href={REPO_URL} className={linkClass}>
              github.com/drodio/pixelparents
            </a>
            .
          </p>

          <p className="text-sm text-white/50">
            Jump to:{" "}
            <a
              href="#how-to-get-involved-as-a-pixel-parent-builder"
              className={linkClass}
            >
              How to get involved
            </a>
            {" · "}
            <a href="#frequently-asked-questions" className={linkClass}>
              FAQ
            </a>
            {" · "}
            <a href="#getting-started" className={linkClass}>
              Getting started
            </a>
          </p>
        </section>

        <section id="getting-started" className="flex scroll-mt-24 flex-col gap-5">
          <h2 className="text-2xl font-bold">Getting started</h2>

          <p className="text-base leading-relaxed text-white/70">
            We build with{" "}
            <a href="https://www.anthropic.com/claude-code" className={linkClass}>
              Claude Code
            </a>
            , an AI coding agent that can read this whole project and get you building
            in minutes. Clone the repo, then point Claude Code at it with a starter
            prompt:
          </p>

          <pre className={preClass}>
            <code>{`git clone ${REPO_URL}
cd pixelparents
claude -p "Read CLAUDE.md and AGENTS.md and treat them as binding instructions for this repo. Explore the codebase — the routes in app/, the modules in lib/, and the developer API under app/api — then give me a short summary of what GoPixel does, how it's organized, and confirm you understand the branch -> PR workflow and the strict no-PII / no-secrets rules. Then tell me you're ready to build."`}</code>
          </pre>

          <p className="text-base leading-relaxed text-white/70">
            New to Claude Code? Drop the{" "}
            <code className="font-mono text-xs text-white/70">-p</code> flag (just{" "}
            <code className="font-mono text-xs text-white/70">claude</code>) to start
            an interactive session you can keep chatting in. You will need{" "}
            <a href="https://nodejs.org" className={linkClass}>
              Node.js
            </a>{" "}
            and the CLI, installed with{" "}
            <code className="font-mono text-xs text-white/70">
              npm install -g @anthropic-ai/claude-code
            </code>
            .
          </p>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="font-semibold text-white">Prefer a desktop app?</h3>
            <p className="mt-1.5 text-base leading-relaxed text-white/70">
              Download the{" "}
              <a href="https://claude.ai/download" className={linkClass}>
                Claude desktop app
              </a>{" "}
              for Mac or Windows. Once it&apos;s installed and you&apos;ve set up
              Claude Code (the CLI above), you can run Claude Code directly inside the
              desktop app and work on this repo without living in a terminal — handy
              if a command line feels unfamiliar.
            </p>
          </div>
        </section>

        <div className="border-t border-white/10" />

        <footer className="flex flex-col items-center gap-3 text-center text-sm text-white/50">
          <p>
            These guidelines live in{" "}
            <code className="font-mono text-xs text-white/70">builders.md</code>{" "}
            in our{" "}
            <a
              href="https://github.com/drodio/pixelparents"
              className="text-inherit underline decoration-dotted decoration-amber-400 underline-offset-2 transition-colors hover:decoration-amber-300"
            >
              open source
            </a>{" "}
            repo — propose changes there.
          </p>
          <div className="flex flex-col items-center gap-1.5">
            <Link
              href="/developers"
              className="text-inherit underline decoration-dotted decoration-amber-400 underline-offset-2 transition-colors hover:decoration-amber-300"
            >
              Explore the GoPixel API →
            </Link>
            <Link
              href="/docs"
              className="text-inherit underline decoration-dotted decoration-amber-400 underline-offset-2 transition-colors hover:decoration-amber-300"
            >
              Read the developer docs →
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
