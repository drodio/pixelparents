import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOCS_NAV, isDocPageSlug } from "@/lib/docs-nav";
import { DocPageServer } from "@/components/docs/DocPageServer";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = DOCS_NAV.find((i) => i.slug === slug && i.kind === "doc");
  const label = item?.label ?? "Docs";
  return {
    title: `${label} — Founder Festival Docs`,
    description: `Founder Festival documentation: ${label}.`,
  };
}

export default async function DocSlugPage({ params }: PageProps) {
  const { slug } = await params;
  // "quickstart" lives at /docs (the index); everything else here. Unknown slugs 404.
  if (slug === "quickstart" || !isDocPageSlug(slug)) notFound();
  return <DocPageServer slug={slug} />;
}
