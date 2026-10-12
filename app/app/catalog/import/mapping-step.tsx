"use client";

import {
  FIELD_INFO,
  FIELDS,
  mappingProblems,
  type Field,
  type Mapping,
} from "@/lib/catalog/import";
import { CURRENCY_CODES } from "@/lib/catalog/currencies";
import { field, primary, secondary } from "@/lib/ui/styles";
import type { FileData } from "./import-wizard";
import { StepHeading } from "./step-heading";

export function MappingStep({
  file,
  mapping,
  currency,
  onChange,
  onBack,
  onNext,
}: {
  file: FileData;
  mapping: Mapping;
  currency: string;
  onChange: (mapping: Mapping, currency: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const problems = mappingProblems(mapping);
  const sample = file.rows[0]?.cells ?? [];
  const set = (f: Field, value: string) => {
    const next = { ...mapping };
    if (value === "") delete next[f];
    else next[f] = Number(value);
    onChange(next, currency);
  };

  return (
    <div className="flex flex-col gap-4">
      <StepHeading step={2} title="Match your columns" focus />
      <p className="text-sm">
        Match the columns in{" "}
        <span className="font-medium">{file.fileName}</span> to ClearDuty
        fields. We guessed where we could.
      </p>
      {file.encoding === "windows-1252" && (
        <p className="text-review text-sm">
          This file is not UTF-8, so we read it as Excel&apos;s Windows
          encoding. If accents or symbols look wrong below, save it as &quot;CSV
          UTF-8&quot; and start again.
        </p>
      )}
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
              const required = FIELD_INFO[f].required;
              return (
                <tr key={f} className="border-border border-t">
                  <td className="px-4 py-2">
                    <label htmlFor={`map-${f}`}>
                      {FIELD_INFO[f].label}
                      {required && (
                        <>
                          <span aria-hidden="true" className="text-risk">
                            {" "}
                            *
                          </span>
                          <span className="sr-only"> (required)</span>
                        </>
                      )}
                    </label>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      id={`map-${f}`}
                      value={index ?? ""}
                      aria-required={required || undefined}
                      onChange={(e) => set(f, e.target.value)}
                      className={`${field} w-full max-w-64`}
                    >
                      <option value="">Not in my file</option>
                      {file.headers.map((h, i) => (
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="file-currency" className="text-sm font-medium">
          Currency of customs values
        </label>
        <select
          id="file-currency"
          value={currency}
          onChange={(e) => onChange(mapping, e.target.value)}
          aria-describedby="file-currency-help"
          className={`${field} w-32`}
        >
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p id="file-currency-help" className="text-muted text-xs">
          Used for rows that have a value but no currency of their own. A
          Shopify export&apos;s &quot;Cost per item&quot; is in your
          store&apos;s currency.
        </p>
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
