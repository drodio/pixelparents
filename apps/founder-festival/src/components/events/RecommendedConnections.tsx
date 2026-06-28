// "Attendee Insights for <firstName>" — Recommended Connections (top-3 people to
// connect with + a give/get match), shown on the recap below the personalized
// learnings. Member/attendee only, and ONLY when already generated on the backend
// (admin run). Pre-generated, sanitized HTML is passed in. No on-demand generation.
import { SectionHeading } from "@/components/SectionHeading";

export function RecommendedConnections({ firstName, html }: { firstName: string; html: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-sky-700/40 bg-gradient-to-b from-sky-500/10 to-transparent p-5">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-sky-500 px-2 py-0.5 text-xs font-medium text-black">🤝 Who to meet</span>
        <SectionHeading label="Attendee Insights" className="font-display text-2xl font-semibold">
          Attendee Insights for {firstName}
        </SectionHeading>
      </div>
      <p className="text-sm text-zinc-400">
        The people at this event most worth connecting with — and a give/get match — based on your
        Festival profile and everyone who attended.
      </p>
      <div
        className="prose-recap leading-relaxed text-zinc-200 [&_a]:text-sky-300 [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
