import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in — ClearDuty" };

const errors: Record<string, string> = {
  link: "That sign-in link is invalid or has expired. Request a new one.",
  google: "Google sign-in isn't available right now. Use your email instead.",
};

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const { next, error } = await searchParams;
  const errorMessage = typeof error === "string" ? errors[error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div>
        <Link href="/" className="text-brand text-sm font-medium">
          ClearDuty
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Sign in or create an account
        </h1>
        <p className="text-muted mt-1 text-sm">
          We&apos;ll email you a link — no password needed.
        </p>
      </div>
      {errorMessage && (
        <p
          role="alert"
          className="border-risk/40 text-risk rounded-md border px-3 py-2 text-sm"
        >
          {errorMessage}
        </p>
      )}
      <SignInForm next={typeof next === "string" ? next : undefined} />
    </main>
  );
}
