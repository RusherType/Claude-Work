import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/workspace/current";

/**
 * Every screen in this group needs a workspace. The check lives here, above the
 * loading.tsx Suspense boundary, so a user without one gets a real 307 to onboarding
 * instead of a redirect streamed inside the page body.
 */
export default async function WorkspaceLayout({
  children,
}: LayoutProps<"/app">) {
  if (!(await getCurrentWorkspace())) redirect("/app/onboarding");
  return children;
}
