import type { Metadata } from "next";
import { adminClient } from "@/lib/admin/load";

export const metadata: Metadata = { title: "Change log · Admin · ClearDuty" };

const TABLE_LABELS: Record<string, string> = {
  tariff_measures: "Tariff measure",
  fee_schedules: "Fee",
  special_programs: "Special program",
};

export default async function AuditPage() {
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("reference_audit")
    .select("id, table_name, row_id, action, actor_id, at, new_row")
    .order("id", { ascending: false })
    .limit(200);
  if (error) throw new Error("Could not load the change log");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Change log</h1>
      {data.length === 0 ? (
        <p className="border-border bg-surface rounded-lg border p-6 text-sm">
          No changes yet.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Latest 200 changes to reference data
            </caption>
            <thead className="text-muted text-left text-xs">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  When (UTC)
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  What
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Change
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Who
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const published = (r.new_row as { published?: boolean } | null)
                  ?.published;
                return (
                  <tr key={r.id} className="border-border border-t">
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                      {r.at.replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="px-4 py-2">
                      {TABLE_LABELS[r.table_name] ?? r.table_name}
                    </td>
                    <td className="px-4 py-2">
                      {r.action}
                      {r.action === "update" && published ? " (published)" : ""}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {r.actor_id?.slice(0, 8) ?? "server job"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
