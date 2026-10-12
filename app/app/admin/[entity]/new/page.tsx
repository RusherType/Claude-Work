import { notFound } from "next/navigation";
import { ENTITY_INFO } from "@/lib/admin/fields";
import { parseEntity } from "@/lib/admin/load";
import { ReferenceForm } from "../../reference-form";

export default async function NewRow(
  props: PageProps<"/app/admin/[entity]/new">,
) {
  const entity = parseEntity((await props.params).entity);
  if (!entity) notFound();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">
        New {ENTITY_INFO[entity].singular}
      </h1>
      <p className="text-muted text-sm">
        Saved as a draft. Nothing changes for customers until you publish.
      </p>
      <ReferenceForm entity={entity} id={null} row={null} />
    </div>
  );
}
