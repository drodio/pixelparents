import Link from "next/link";
import ReportForm from "./report-form";

export const metadata = {
  title: "Contact / Report — GoPixel",
  description:
    "Report a bug or abuse, ask a question, or request that we delete your data. Goes straight to the GoPixel team.",
};

// Standalone contact / report page. Hosts the same <ReportForm> as the landing
// footer modal, so the privacy/terms "contact us" copy can link here instead of
// the dead hello@gopixel.org mailbox. Submissions persist to the `reports`
// DB table and are triaged from /admin/reports.
export default function ReportPage() {
  return (
    <div className="flex flex-1 flex-col bg-black px-6 py-16 text-white sm:py-24">
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <header className="flex flex-col gap-3">
          <Link
            href="/"
            className="text-sm text-amber-400 underline decoration-amber-400/60 underline-offset-2 transition-colors hover:text-amber-300"
          >
            ← Back to GoPixel
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Contact us
          </h1>
          <p className="text-sm text-white/50">
            Report a bug or abuse, ask a question, or request that we delete your
            data. It goes straight to the team.
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <ReportForm />
        </section>
      </div>
    </div>
  );
}
