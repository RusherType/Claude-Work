import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { INVITE_TOKEN_PATTERN } from "@/lib/workspace/invite-token";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata: Metadata = { title: "Join a workspace — ClearDuty" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);

  const valid = INVITE_TOKEN_PATTERN.test(token);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Join a workspace</h1>
      {valid ? (
        <>
          <p className="text-muted text-sm">
            You&apos;re signed in as <span className="text-foreground font-medium">{user.email}</span>. Accept to join
            the workspace that invited this address.
          </p>
          <AcceptInviteForm token={token} />
        </>
      ) : (
        <p role="alert" className="text-risk text-sm">
          This invitation link is not valid. Ask for a new invite.
        </p>
      )}
    </main>
  );
}
