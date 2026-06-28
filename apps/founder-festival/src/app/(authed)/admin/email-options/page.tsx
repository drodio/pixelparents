import { currentUser } from "@clerk/nextjs/server";
import { isSuperAdmin } from "@/lib/admin";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { DEFAULT_EMAIL_SIGNATURE, getEmailSignatureText } from "@/lib/email-signature";
import { EmailOptionsForm } from "@/components/admin/EmailOptionsForm";

export const dynamic = "force-dynamic";

export default async function AdminEmailOptionsPage() {
  if (!(await isSuperAdmin())) {
    const user = await currentUser().catch(() => null);
    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
    return <NotAuthorized email={email} />;
  }
  const current = await getEmailSignatureText();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 text-sm">
        <a href="/admin" className="link text-sm">← Admin home</a>
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Email options</h1>
      <p className="text-zinc-400 text-sm -mt-2 max-w-2xl">
        This signature is appended to the bottom of <strong>every</strong> outgoing Festival
        email. Edit it below — line breaks are preserved and any email address becomes a link.
      </p>
      <EmailOptionsForm initialValue={current} defaultValue={DEFAULT_EMAIL_SIGNATURE} />
    </div>
  );
}
