import { createHash, randomBytes } from "node:crypto";

/**
 * Invite links carry a random token; the database stores only its SHA-256 hex,
 * which matches `encode(extensions.digest(token, 'sha256'), 'hex')` in accept_invitation().
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
