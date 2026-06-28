// "Personalized Learnings for <firstName>" — sits above the public learnings on
// the recap. Member/attendee only. Shown ONLY when learnings have already been
// generated on the backend (admin run); the pre-generated, sanitized HTML is
// passed in and rendered in the recap prose style. No on-demand generation.
import { SectionHeading } from "@/components/SectionHeading";

export function PersonalizedLearnings({ firstName, html }: { firstName: string; html: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[#dfa43a]/40 bg-gradient-to-b from-[#dfa43a]/10 to-transparent p-5">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-[#dfa43a] px-2 py-0.5 text-xs font-medium text-black">✨ For you</span>
        <SectionHeading label="Personalized Learnings" className="font-display text-2xl font-semibold">
          Personalized Learnings for {firstName}
        </SectionHeading>
      </div>
      <p className="text-sm text-zinc-400">
        These event learnings are tailored to you — drawn from your Festival profile and everything
        shared at this event.
      </p>
      <div
        className="prose-recap leading-relaxed text-zinc-200 [&_a]:text-[#dfa43a] [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
