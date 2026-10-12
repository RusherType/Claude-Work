"use client";

import {
  FIELD_INFO,
  FIELDS,
  mappingProblems,
  type Field,
  type Mapping,
} from "@/lib/catalog/import";
import { field, primary, secondary } from "@/lib/ui/styles";

export function MappingStep({
  fileName,
  headers,
  sample,
  mapping,
  onChange,
  onBack,
  onNext,
}: {
  fileName: string;
  headers: string[];
  sample: string[];
  mapping: Mapping;
  onChange: (mapping: Mapping) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const problems = mappingProblems(mapping);
  const set = (f: Field, value: string) => {
    const next = { ...mapping };
    if (value === "") delete next[f];
    else next[f] = Number(value);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Match the columns in <span className="font-medium">{fileName}</span> to
        ClearDuty fields. We guessed where we could.
      </p>
      <div className="border-border bg-surface overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-muted text-left text-xs">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                ClearDuty field
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Column in your file
              </th>
              <th
                scope="col"
                className="hidden px-4 py-2 font-medium sm:table-cell"
              >
                First row
              </th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((f) => {
              const index = mapping[f];
              return (
                <tr key={f} className="border-border border-t">
                  <td className="px-4 py-2">
                    <label htmlFor={`map-${f}`}>
                      {FIELD_INFO[f].label}
                      {FIELD_INFO[f].required && (
                        <span className="text-risk"> *</span>
                      )}
                    </label>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      id={`map-${f}`}
                      value={index ?? ""}
                      onChange={(e) => set(f, e.target.value)}
                      className={`${field} w-full max-w-64`}
                    >
                      <option value="">Not in my file</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-muted hidden max-w-64 truncate px-4 py-2 sm:table-cell">
                    {index === undefined ? "—" : sample[index] || "(blank)"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {problems.length > 0 && (
        <ul role="alert" className="text-risk list-disc pl-5 text-sm">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onNext}
          disabled={problems.length > 0}
          className={primary}
        >
          Check rows
        </button>
        <button type="button" onClick={onBack} className={secondary}>
          Choose another file
        </button>
      </div>
    </div>
  );
}
