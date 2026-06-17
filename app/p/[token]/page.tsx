import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSharedProfileByToken } from "@/lib/db/signups";
import { shareFieldsOrDefault } from "@/lib/share";
import { signedPhotoUrls } from "@/lib/blob";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A Pixel Parents profile",
  description:
    "A family in the Pixel Parents community — OHS parents building software for our kids.",
  // A secret link should never be indexed.
  robots: { index: false, follow: false },
  openGraph: {
    title: "A Pixel Parents profile",
    description:
      "A family in the Pixel Parents community — OHS parents building software for our kids.",
    type: "profile",
    // A page-level openGraph doesn't inherit the root file-based image, so set it.
    images: ["/opengraph-image.png"],
  },
  twitter: { card: "summary_large_image", images: ["/opengraph-image.png"] },
};

function Pills({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <span
          key={t}
          className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-sm text-white/85"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-white/40">
      {children}
    </div>
  );
}

export default async function SharedProfilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const profile = await getSharedProfileByToken(token);
  if (!profile) notFound();

  const { signup, kids } = profile;
  const visible = new Set(shareFieldsOrDefault(signup.shareFields));

  const location = [signup.city, signup.state].filter(Boolean).join(", ");
  const interests = signup.parentInterests ?? [];
  const photos = signup.photos ?? [];
  const showContact = visible.has("phone") || visible.has("email");

  // Private blobs need presigned URLs to render.
  const photoUrls =
    visible.has("photos") && photos.length > 0
      ? await signedPhotoUrls(photos.map((p) => p.pathname))
      : [];

  return (
    <main className="min-h-dvh bg-black text-white">
      <Image
        src="/images/banner.webp"
        alt=""
        width={2000}
        height={1125}
        priority
        className="aspect-[13/5] w-full object-cover object-top"
      />
      <div className="border-b border-white/10 bg-white/[0.03]">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-6 py-2.5 text-sm text-white/55">
          <span aria-hidden>🔒</span>
          Shared privately by {signup.firstName} · Pixel Parents
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {signup.firstName} {signup.lastName}
        </h1>
        {visible.has("location") && location && (
          <p className="mt-1.5 text-white/55">{location}</p>
        )}

        {visible.has("interests") && interests.length > 0 && (
          <section className="mt-9">
            <Label>Parent interests</Label>
            <Pills items={interests} />
          </section>
        )}

        {visible.has("photos") && photos.length > 0 && (
          <section className="mt-9">
            <Label>Photos</Label>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {photos.map((p, i) =>
                photoUrls[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.pathname}
                    src={photoUrls[i]}
                    alt=""
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                ) : null,
              )}
            </div>
          </section>
        )}

        {visible.has("children") && kids.length > 0 && (
          <section className="mt-9">
            <Label>Children at OHS</Label>
            <div className="flex flex-col gap-3.5">
              {kids.map((kid) => (
                <div
                  key={kid.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
                >
                  <h3 className="text-lg font-semibold">{kid.firstName}</h3>
                  {kid.grade && (
                    <div className="mt-0.5 text-sm font-semibold text-amber-400">
                      {kid.grade}
                    </div>
                  )}
                  {kid.interests && kid.interests.length > 0 && (
                    <div className="mt-3">
                      <Pills items={kid.interests} />
                    </div>
                  )}
                  {kid.notes && (
                    <p className="mt-3 text-sm text-white/55">{kid.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {showContact && (
          <section className="mt-9">
            <Label>Contact</Label>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-white/85">
              {visible.has("phone") && signup.phone && (
                <span>
                  📱{" "}
                  <a href={`tel:${signup.phone}`} className="text-amber-400 hover:underline">
                    {signup.phone}
                  </a>
                </span>
              )}
              {visible.has("email") && signup.email && (
                <span>
                  ✉️{" "}
                  <a href={`mailto:${signup.email}`} className="text-amber-400 hover:underline">
                    {signup.email}
                  </a>
                </span>
              )}
            </div>
          </section>
        )}

        <footer className="mt-14 border-t border-white/10 pt-6 text-sm text-white/45">
          This is a private profile shared via a secret link. The owner controls
          it and can disable it at any time, which immediately makes this page
          stop working.
          <br />
          <Link href="/" className="text-white/65 hover:underline">
            Pixel Parents →
          </Link>
        </footer>
      </div>
    </main>
  );
}
