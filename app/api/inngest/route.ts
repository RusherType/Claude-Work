import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

// Inngest calls this route to run steps; requests are signed with INNGEST_SIGNING_KEY when deployed.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
