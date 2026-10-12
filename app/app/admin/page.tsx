import type { Metadata } from "next";
import Link from "next/link";
import { ENTITY_INFO } from "@/lib/admin/fields";
import { ENTITIES } from "@/lib/admin/schemas";

export const metadata: Metadata = { title: "Admin · ClearDuty" };

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Reference data</h1>
        <p className="text-muted mt-1 text-sm">
          Every row is a draft until you publish it. Published rows never
          change: to correct one, give it an end date and add a new row. Each
          change is recorded in the change log.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {ENTITIES.map((e) => (
          <li
            key={e}
            className="border-border bg-surface rounded-lg border p-4"
          >
            <Link href={`/app/admin/${e}`} className="text-brand font-medium">
              {ENTITY_INFO[e].title}
            </Link>
            <p className="text-muted mt-1 text-sm">{ENTITY_INFO[e].intro}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
