import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "../../app/actions";
import { AcceptInvitationForm } from "./accept-form";

export const metadata: Metadata = {
  title: "Join a workspace · ClearDuty",
  referrer: "no-referrer",
};

// The invitation is accepted only by an explicit POST (never on page load), by the signed-in user
// whose confirmed email matches the invitation (checked in accept_invitation).
export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const valid = /^[0-9a-f]{64}$/.test(token);
  const user = await getCurrentUser();
  if (!user && valid)
    redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-brand text-sm font-medium">ClearDuty</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Join your team&apos;s workspace
        </h1>
      </div>
      {valid ? (
        <>
          <p className="text-muted text-sm">
            You&apos;re signed in as{" "}
            <span className="text-foreground">{user?.email}</span>. The
            invitation must have been sent to this address.
          </p>
          <AcceptInvitationForm token={token} />
          <form action={signOut}>
            <input type="hidden" name="next" value={`/invite/${token}`} />
            <button type="submit" className="text-brand text-sm underline">
              Not you? Sign in with a different address
            </button>
          </form>
        </>
      ) : (
        <p
          role="alert"
          className="border-risk text-risk rounded-md border px-3 py-2 text-sm"
        >
          This invitation link is not valid. Ask the person who invited you for
          a new one.
        </p>
      )}
    </main>
  );
}
