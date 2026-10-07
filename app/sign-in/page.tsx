import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/auth/redirect";
import { googleAuthEnabled, supabaseEnv } from "@/lib/env";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · ClearDuty" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link is invalid or has expired. Request a new one.",
  google: "Google sign-in didn't work. Try again or use an email link.",
};

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const error =
    typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const configured = supabaseEnv() !== null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-brand text-sm font-medium">
          ClearDuty
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sign in or create an account
        </h1>
        <p className="text-muted text-sm">
          We&apos;ll email you a link. No password needed.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="border-risk text-risk rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      {configured ? (
        <SignInForm next={next} googleEnabled={googleAuthEnabled()} />
      ) : (
        <p
          role="alert"
          className="border-review text-review rounded-md border px-3 py-2 text-sm"
        >
          Sign-in isn&apos;t configured on this server yet (missing Supabase
          settings).
        </p>
      )}
    </main>
  );
}
