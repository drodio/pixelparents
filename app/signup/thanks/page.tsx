import type { Metadata } from "next";
import Image from "next/image";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { getInterestPool } from "@/lib/interests";
import FamilyForm from "./family-form";

export const metadata: Metadata = {
  title: "Welcome — Pixel Parents",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DRODIO_SUBMISSION_URL = process.env.NEXT_PUBLIC_DRODIO_SUBMISSION_URL;

async function getFirstName(id?: string): Promise<string | null> {
  if (!id || !UUID_RE.test(id)) return null;
  try {
    const [row] = await db
      .select({ firstName: signups.firstName })
      .from(signups)
      .where(eq(signups.id, id))
      .limit(1);
    return row?.firstName ?? null;
  } catch (err) {
    console.error("getFirstName failed:", err);
    return null;
  }
}

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const [firstName, interestPool] = await Promise.all([
    getFirstName(id),
    getInterestPool(),
  ]);
  const greeting = firstName ? `${firstName}, nice to meet you.` : "Nice to meet you.";

  return (
    <main className="min-h-dvh bg-black text-white">
      <Image
        src="/images/banner.webp"
        alt=""
        width={2000}
        height={1125}
        priority
        className="h-48 w-full object-cover sm:h-64"
      />
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{greeting}</h1>

        <div className="mt-6 space-y-4 text-white/70">
          <p>
            I&apos;m DROdio, dad to Devina, who&apos;s just entering OHS as a 7th
            grader. I&apos;m the CEO of Chief, an AI Chief of Staff startup in the
            SF Bay area. I love to build impactful software.
          </p>
          <p>
            My objective with this website is to build software that will
            transform the experiences of parents and students at OHS. I aim to
            not run afoul of any OHS rules &amp; regs, but also to stay
            independent as parents who want to make a difference and move fast
            with no politics.
          </p>
          <p>
            I hope to make everything we do open source so others can benefit
            from it. Ensuring our kids&apos; safety and privacy is top-of-mind,
            and within that safe space I want to be as fully inclusive as
            possible.
          </p>
          <p>
            I have no idea (yet) what we&apos;ll build, but I want it to be
            impactful — and I want us to be proud of having enabled an incredible
            educational experience for our kids.
          </p>
          <p>
            I&apos;d also like a small data set to start with. If you&apos;re
            willing to fill out the info below about your child(ren) at OHS, we
            can use it as our initial seed data set before bringing other parents
            in.
            {DRODIO_SUBMISSION_URL ? (
              <>
                {" "}
                For reference, here are{" "}
                <a
                  href={DRODIO_SUBMISSION_URL}
                  className="underline decoration-white/40 hover:decoration-white"
                >
                  my answers
                </a>
                .
              </>
            ) : null}
          </p>
          <p className="text-white/50">
            This information is optional — feel free to hold off until later if
            you prefer. It&apos;s stored in a Neon serverless Postgres database,
            and as a parent you maintain full control over your data. Only
            authenticated OHS families will ever see your answers.
          </p>
        </div>

        <div className="mt-10">
          <FamilyForm signupId={id ?? ""} suggestedInterests={interestPool} />
        </div>
      </div>
    </main>
  );
}
