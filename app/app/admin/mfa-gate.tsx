"use client";

import { useActionState, useState } from "react";
import { field, primary, secondary } from "@/lib/ui/styles";
import {
  startEnrollment,
  verifyCode,
  type EnrollState,
  type VerifyState,
} from "./mfa-actions";

const idle: VerifyState = { status: "idle" };

/** Admin pages need a second factor in this session: set one up, or enter its code. */
export function MfaGate({ hasFactor }: { hasFactor: boolean }) {
  const [enroll, setEnroll] = useState<EnrollState>({ status: "idle" });
  const [starting, setStarting] = useState(false);
  const [verify, verifyAction, verifying] = useActionState(verifyCode, idle);
  const factorId = enroll.status === "enrolled" ? enroll.factorId : undefined;
  const showCode = hasFactor || factorId;

  return (
    <section className="border-border bg-surface flex max-w-lg flex-col gap-4 rounded-lg border p-6">
      <div>
        <h1 className="text-xl font-semibold">Confirm it&apos;s you</h1>
        <p className="text-muted mt-1 text-sm">
          Tariff measures and fees change what every customer pays, so admin
          pages need a code from an authenticator app in this session.
        </p>
      </div>

      {!hasFactor && enroll.status !== "enrolled" && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={primary}
            disabled={starting}
            onClick={async () => {
              setStarting(true);
              setEnroll(await startEnrollment());
              setStarting(false);
            }}
          >
            {starting ? "Setting up…" : "Set up an authenticator app"}
          </button>
          {enroll.status === "error" && (
            <p role="alert" className="text-risk text-sm">
              {enroll.message}
            </p>
          )}
        </div>
      )}

      {enroll.status === "enrolled" && (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Scan this code with your authenticator app (for example 1Password,
            Google Authenticator or Authy), then enter the 6-digit code it
            shows.
          </p>
          {/* A data: URI from Supabase; next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enroll.qr}
            alt="QR code for your authenticator app"
            width={180}
            height={180}
            className="rounded bg-white p-2"
          />
          <p>
            Can&apos;t scan it? Enter this key instead:{" "}
            <code
              className="font-mono text-xs break-all"
              data-testid="totp-secret"
            >
              {enroll.secret}
            </code>
          </p>
        </div>
      )}

      {showCode && (
        <form action={verifyAction} className="flex flex-wrap items-end gap-3">
          {factorId && <input type="hidden" name="factorId" value={factorId} />}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="totp-code" className="text-sm font-medium">
              6-digit code
            </label>
            <input
              id="totp-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              className={`${field} w-32 font-mono`}
            />
          </div>
          <button
            type="submit"
            disabled={verifying}
            className={hasFactor ? primary : secondary}
          >
            {verifying ? "Checking…" : "Verify"}
          </button>
          {verify.status === "error" && (
            <p role="alert" className="text-risk w-full text-sm">
              {verify.message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
