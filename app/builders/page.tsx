import { readFileSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";
import Link from "next/link";
import Markdown from "./markdown";

export const metadata = {
  title: "Builder Guidelines — Pixel Parents",
  description:
    "How Pixel Parents tech builders work together: a high-trust, open-source, learn-by-shipping community of OHS parents building software for our kids — protecting PII and using AI safely.",
};

// builders.md lives at the repo root so it's easy to find and edit in the open
// source repo. Read at build time and rendered as the page below.
const source = readFileSync(join(process.cwd(), "builders.md"), "utf8");

export default function BuildersPage() {
  return (
    <div className="flex flex-1 flex-col bg-black px-6 py-16 text-white sm:py-24">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <header className="flex flex-col items-center gap-6 text-center">
          <Link
            href="/"
            aria-label="Pixel Parents home"
            className="opacity-90 transition-opacity hover:opacity-100"
          >
            <Image
              src="/images/pixel-mascot.png"
              alt="Pixel Parents mascot"
              width={934}
              height={918}
              priority
              className="h-auto w-24"
            />
          </Link>
        </header>

        <article className="flex flex-col gap-6">
          <Markdown content={source} />
        </article>

        <div className="border-t border-white/10" />

        <footer className="flex flex-col items-center gap-3 text-center text-sm text-white/50">
          <p>
            These guidelines live in{" "}
            <code className="font-mono text-xs text-white/70">builders.md</code>{" "}
            in our open source repo — propose changes there.
          </p>
          <Link
            href="/developers"
            className="font-medium text-emerald-400 underline-offset-2 hover:underline"
          >
            Explore the Pixel Parents API →
          </Link>
        </footer>
      </div>
    </div>
  );
}
