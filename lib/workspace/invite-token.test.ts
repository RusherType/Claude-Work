import { describe, expect, it } from "vitest";
import {
  INVITE_TOKEN_PATTERN,
  generateInviteToken,
  hashInviteToken,
} from "./invite-token";

describe("invite tokens", () => {
  it("hashes like Postgres digest(token, 'sha256') in hex", () => {
    // select encode(extensions.digest('abc', 'sha256'), 'hex')
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("generates unguessable URL-safe tokens and their hash", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.token).toMatch(INVITE_TOKEN_PATTERN);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashInviteToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
