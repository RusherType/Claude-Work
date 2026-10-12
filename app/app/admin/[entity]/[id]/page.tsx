import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ENTITY_INFO,
  FORM_FIELDS,
  formValue,
  rowStatus,
} from "@/lib/admin/fields";
import { getRow, parseEntity, today } from "@/lib/admin/load";
import { ReferenceForm } from "../../reference-form";
import { DraftActions, EndDateForm } from "../../row-actions";
import { StatusBadge } from "../../status-badge";

export default async function EditRow(
  props: PageProps<"/app/admin/[entity]/[id]">,
) {
  const { entity: e, id } = await props.params;
  const entity = parseEntity(e);
  if (!entity) notFound();
  const row = await getRow(entity, id);
  if (!row) notFound();
  const status = rowStatus(row, today());
  const info = ENTITY_INFO[entity];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/app/admin/${entity}`}
        className="text-brand text-sm underline"
      >
        ← All {info.title.toLowerCase()}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">
          {row.published
            ? info.singular[0].toUpperCase() + info.singular.slice(1)
            : `Draft ${info.singular}`}
        </h1>
        <StatusBadge status={status} />
      </div>

      {row.published ? (
        <>
          <dl className="border-border bg-surface grid gap-x-6 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-[max-content_1fr]">
            {FORM_FIELDS[entity].map((f) => (
              <div key={f.name} className="contents">
                <dt className="text-muted">{f.label}</dt>
                <dd className="font-mono text-xs break-all">
                  {f.kind === "exempt"
                    ? row.exempt_programs === null
                      ? "Not checked yet"
                      : formValue(row, f.name) || "None"
                    : f.kind === "checkbox"
                      ? row[f.name]
                        ? "Yes"
                        : "No"
                      : formValue(row, f.name) || "—"}
                </dd>
              </div>
            ))}
            <div className="contents">
              <dt className="text-muted">Published at</dt>
              <dd className="font-mono text-xs">
                {formValue(row, "published_at")}
              </dd>
            </div>
          </dl>
          {row.effective_to === null ? (
            <EndDateForm
              entity={entity}
              id={row.id}
              from={row.effective_from}
            />
          ) : (
            <p className="text-muted text-sm">
              Ends {row.effective_to}. To change anything, add a new{" "}
              {info.singular}.
            </p>
          )}
        </>
      ) : (
        <>
          <ReferenceForm entity={entity} id={row.id} row={row} />
          <DraftActions entity={entity} id={row.id} />
        </>
      )}
    </div>
  );
}
