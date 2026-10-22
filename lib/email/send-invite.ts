import "server-only";

/**
 * Sends the invite email through Resend when RESEND_API_KEY is set. Without a key
 * (local development) it sends nothing and the inviter copies the link from the UI.
 * Returns whether an email was actually sent.
 */
export async function sendInviteEmail(input: {
  to: string;
  workspaceName: string;
  inviterEmail: string;
  link: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: `Join ${input.workspaceName} on ClearDuty`,
      text: `${input.inviterEmail} invited you to ${input.workspaceName} on ClearDuty.\n\nAccept the invite: ${input.link}\n\nThe link expires in 7 days.`,
    }),
  });
  return res.ok;
}
