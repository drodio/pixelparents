import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chatham House Rule · Founder Festival",
  description:
    "How Founder Festival uses the Chatham House Rule to scale learnings from private events while protecting attribution.",
};

export default function ChathamPage() {
  return (
    <article className="flex flex-col flex-1 px-6 py-16 sm:py-24 bg-[#151515] text-zinc-100">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-10">
        <a
          href="/?home=1"
          aria-label="Founder Festival home"
          className="self-center opacity-90 hover:opacity-100 transition-opacity"
        >
          <img
            src="/images/founder-festival-logo.png"
            alt="Founder Festival"
            width={498}
            height={444}
            className="w-[72px] h-auto"
          />
        </a>
        <header className="flex flex-col gap-3 border-b border-zinc-800 pb-8">
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
            Chatham House Rule
          </h1>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            What is the &ldquo;Chatham House Rule?&rdquo;
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            The shorthand is &ldquo;What happens in Vegas, stays in
            Vegas&rdquo; — although it&apos;s actually more nuanced than that.
          </p>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            Chatham House Rule forms the basis of how we permission content
            at Founder Festival events.
          </p>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            This is the rule:
          </p>
          <blockquote className="border-l-2 pl-5 py-2 italic text-zinc-300 leading-relaxed" style={{ borderColor: "#dfa43a" }}>
            &ldquo;When a meeting, or part thereof, is held under the Chatham
            House Rule, participants are free to use the information received,
            but neither the identity nor the affiliation of the speaker(s),
            nor that of any other participant, may be revealed.&rdquo;
          </blockquote>
          <aside
            className="rounded-md border px-5 py-4 text-base leading-relaxed mt-2"
            style={{ borderColor: "#dfa43a", color: "#dfa43a", backgroundColor: "rgba(223,164,58,0.06)" }}
          >
            <span className="mr-2" aria-hidden>💡</span>
            <strong className="font-semibold">Here&apos;s what you need to remember:</strong>{" "}
            Don&apos;t attribute anything you hear under CHR to a specific
            source. Nothing should be done to identify, either explicitly or
            implicitly, who said what.
          </aside>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            How does Founder Festival share out learnings from these private
            events?
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            Founder Festival uses{" "}
            <a
              href="https://Chief.bot"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Chief
            </a>{" "}
            to capture content at events. You will be given an appropriate
            level of access to the learnings from events based on your
            FounderScore<sup className="text-[0.55em] leading-none -ml-px">™</sup>.
          </p>
        </section>

        <footer className="border-t border-zinc-800 pt-8 mt-4">
          <a href="/?home=1" className="link text-sm">
            ← Back to Founder Festival
          </a>
        </footer>
      </div>
    </article>
  );
}
