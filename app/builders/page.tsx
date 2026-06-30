import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import Markdown from "./markdown";
import InterestTiles from "../signup/interest-tiles";
import { PixelMascot } from "@/components/pixel-mascot";
import { getInterestPool } from "@/lib/interests";

export const metadata = {
  title: "Builder Guidelines — Pixel Parents",
  description:
    "How Pixel Parents tech builders work together: a high-trust, open-source, learn-by-shipping community of OHS parents building software for our kids — protecting PII and using AI safely.",
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
        </header>

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
claude -p "Read CLAUDE.md and AGENTS.md and treat them as binding instructions for this repo. Explore the codebase — the routes in app/, the modules in lib/, and the developer API under app/api — then give me a short summary of what Pixel Parents does, how it's organized, and confirm you understand the branch -> PR workflow and the strict no-PII / no-secrets rules. Then tell me you're ready to build."`}</code>
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
          <Link
            href="/developers"
            className="text-inherit underline decoration-dotted decoration-amber-400 underline-offset-2 transition-colors hover:decoration-amber-300"
          >
            Explore the Pixel Parents API →
          </Link>
        </footer>
      </div>
    </div>
  );
}
