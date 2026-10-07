"use client";

import { useActionState } from "react";
import { sendMagicLink, signInWithGoogle, type SignInState } from "./actions";

const initial: SignInState = { status: "idle" };

export function SignInForm({
  next,
  googleEnabled,
}: {
  next: string;
  googleEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="border-border bg-surface rounded-lg border p-5"
      >
        <h2 className="font-semibold">Check your email</h2>
        <p className="text-muted mt-1 text-sm">
          We sent a sign-in link to{" "}
          <span className="text-foreground">{state.email}</span>. It works once
          and expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="next" value={next} />
        <label htmlFor="email" className="text-sm font-medium">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={state.status === "error"}
          aria-describedby={
            state.status === "error" ? "email-error" : undefined
          }
          className="border-border bg-surface focus-visible:ring-brand rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        {state.status === "error" && (
          <p id="email-error" role="alert" className="text-risk text-sm">
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="bg-brand focus-visible:ring-brand dark:text-background rounded-md px-4 py-2.5 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
        >
          {pending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>

      {googleEnabled && (
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="border-border bg-surface focus-visible:ring-brand w-full rounded-md border px-4 py-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            Continue with Google
          </button>
        </form>
      )}
    </div>
  );
}
