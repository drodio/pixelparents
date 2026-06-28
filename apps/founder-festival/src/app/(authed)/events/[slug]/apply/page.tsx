import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/events";
import { ApplyForm } from "@/components/events/ApplyForm";

type PageProps = { params: Promise<{ slug: string }> };

export default async function ApplyPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "draft") notFound();

  return (
    <main className="min-h-screen bg-[#151515] text-zinc-100 px-4 sm:px-6 py-12">
      <div className="max-w-2xl mx-auto flex flex-col items-center gap-8">
        <a href="/" aria-label="Founder Festival home">
          <img
            src="/images/founder-festival-logo.png"
            alt="Founder Festival"
            className="w-14 h-auto"
          />
        </a>
        <header className="flex flex-col gap-2 text-center">
          <h1 className="font-display text-3xl sm:text-4xl font-bold">
            Apply: {event.title}
          </h1>
          <p className="text-zinc-400 text-sm">
            We&apos;ll review every application personally and be in touch within 48 hours.
          </p>
        </header>
        <ApplyForm slug={event.slug} />
      </div>
    </main>
  );
}
