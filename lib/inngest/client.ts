import { Inngest } from "inngest";

// Locally, `pnpm inngest:dev` runs the Inngest dev server (no account needed).
// Deployed, INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY come from the Inngest dashboard.
export const inngest = new Inngest({ id: "clearduty" });
