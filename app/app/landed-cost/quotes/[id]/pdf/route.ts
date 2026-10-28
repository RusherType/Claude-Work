import { loadSavedQuote } from "@/lib/landed-cost/saved";
import { quotePdf } from "@/lib/landed-cost/pdf";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// CD-051: the saved quote as a PDF, for the signed-in member's current workspace only.
export async function GET(
  _req: Request,
  ctx: RouteContext<"/app/landed-cost/quotes/[id]/pdf">,
) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const session = await getWorkspaceContext();
  if (!session?.workspace)
    return new Response("Sign in first", { status: 401 });
  const supabase = await createClient();
  if (!supabase) return new Response("Not configured", { status: 503 });

  const quote = await loadSavedQuote(supabase, session.workspace.id, id);
  if (!quote) return new Response("Not found", { status: 404 });
  if (quote === "unreadable")
    return new Response("This quote can't be shown", { status: 422 });

  const pdf = await quotePdf(quote, session.workspace.name);
  const file = `quote-${quote.entryDate}-${id.slice(0, 8)}.pdf`;
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
