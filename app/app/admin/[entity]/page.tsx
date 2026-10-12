import Link from "next/link";
import { notFound } from "next/navigation";
import { ENTITY_INFO, rowStatus, summary } from "@/lib/admin/fields";
import { listRows, parseEntity, today } from "@/lib/admin/load";
import { primary } from "@/lib/ui/styles";
import { StatusBadge } from "../status-badge";

export default async function EntityList(
  props: PageProps<"/app/admin/[entity]">,
) {
  const entity = parseEntity((await props.params).entity);
  if (!entity) notFound();
  const info = ENTITY_INFO[entity];
  const rows = await listRows(entity);
  const now = today();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{info.title}</h1>
          <p className="text-muted mt-1 max-w-2xl text-sm">{info.intro}</p>
        </div>
        <Link href={`/app/admin/${entity}/new`} className={primary}>
          New {info.singular}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="border-border bg-surface rounded-lg border p-6 text-sm">
          No {info.title.toLowerCase()} yet. Add the first one with its source.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">{info.title}</caption>
            <thead className="text-muted text-left text-xs">
              <tr>
                {summary(entity, rows[0]).map(([label]) => (
                  <th key={label} scope="col" className="px-4 py-2 font-medium">
                    {label}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2 font-medium">
                  Dates
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cols = summary(entity, r);
                return (
                  <tr key={r.id} className="border-border border-t align-top">
                    {cols.map(([label, value], i) => (
                      <td key={label} className="px-4 py-2">
                        {i === 0 ? (
                          <Link
                            href={`/app/admin/${entity}/${r.id}`}
                            className="text-brand underline"
                          >
                            {value || "(untitled)"}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs">{value}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                      {r.effective_from} → {r.effective_to ?? "open"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={rowStatus(r, now)} />
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
