// Plain-English messages for errors raised by the CD-004 database functions and policies.
const MESSAGES: Record<string, string> = {
  not_authenticated: "Your session has ended. Sign in again.",
  forbidden: "You don't have permission to do that in this workspace.",
  only_owners_invite_owners: "Only an owner can invite another owner.",
  invalid_name: "Enter a workspace name of up to 120 characters.",
  invalid_country: "Choose a home country.",
  invalid_business_type: "Choose what kind of business this is.",
  too_many_workspaces: "You already own the maximum number of workspaces.",
  invalid_email: "Enter a valid email address.",
  already_member: "That person is already in this workspace.",
  too_many_invitations:
    "This workspace has too many open invitations. Revoke some first.",
  invitation_invalid: "This invitation is no longer valid. Ask for a new one.",
  invitation_expired: "This invitation has expired. Ask for a new one.",
  invitation_wrong_email:
    "This invitation was sent to a different email address. Sign in with that address to accept it.",
  "A workspace must keep at least one owner":
    "A workspace must keep at least one owner. Make someone else an owner first.",
};

export const GENERIC_ERROR = "Something went wrong. Try again.";

/** Map a Supabase/Postgres error to a message safe to show the user. */
export function workspaceErrorMessage(
  error: { message?: string; code?: string } | null,
): string {
  if (!error) return GENERIC_ERROR;
  if (error.message && MESSAGES[error.message]) return MESSAGES[error.message];
  if (error.code === "42501") return MESSAGES.forbidden;
  if (error.code === "23514" && error.message?.includes("owner"))
    return MESSAGES["A workspace must keep at least one owner"];
  return GENERIC_ERROR;
}
