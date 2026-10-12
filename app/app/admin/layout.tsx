import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminAccess } from "@/lib/admin/access";
import { MfaGate } from "./mfa-gate";

// CD-014: platform admins only (others get a 404), and only with a second factor in this session.
export default async function AdminLayout({
  children,
}: LayoutProps<"/app/admin">) {
  const access = await adminAccess();
  if (access.status === "signed_out") redirect("/sign-in?next=/app/admin");
  if (access.status === "not_admin") notFound();
  if (access.status === "needs_mfa")
    return <MfaGate hasFactor={access.hasFactor} />;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Admin" className="flex flex-wrap gap-4 text-sm">
        <Link href="/app/admin" className="font-semibold">
          Admin
        </Link>
        <Link href="/app/admin/measures">Tariff measures</Link>
        <Link href="/app/admin/fees">Fees</Link>
        <Link href="/app/admin/programs">Special programs</Link>
        <Link href="/app/admin/audit">Change log</Link>
      </nav>
      {children}
    </div>
  );
}
