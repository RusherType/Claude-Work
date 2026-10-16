"use client";

import { useActionState } from "react";
import type { Question } from "@/lib/classification/card";
import { field, secondary } from "@/lib/ui/styles";
import { answerQuestion, type DecisionState } from "./actions";
import type { Origin } from "./decision-panel";

const idle: DecisionState = { status: "idle" };

/** One agent question: answer chips, or "Other" in your own words (docs/04-frontend.md). */
export function QuestionPrompt({
  question,
  productId,
  classificationId,
  origin,
  first,
}: {
  question: Question;
  productId: string;
  classificationId: string | null;
  origin: Origin;
  /** The Q shortcut focuses the first question's first control. */
  first: boolean;
}) {
  const [state, action, pending] = useActionState(answerQuestion, idle);
  const error = state.status === "error" ? state : null;
  const hidden = (
    <>
      <input type="hidden" name="questionId" value={question.id} />
      <input type="hidden" name="productId" value={productId} />
      <input
        type="hidden"
        name="classificationId"
        value={classificationId ?? ""}
      />
      <input type="hidden" name="from" value={origin.from} />
      {origin.nextId && (
        <input type="hidden" name="nextId" value={origin.nextId} />
      )}
    </>
  );
  const otherId = `answer-${question.id}`;

  return (
    <div
      role="group"
      aria-labelledby={`q-${question.id}`}
      className="border-review flex flex-col gap-2 rounded-md border p-3"
    >
      <p id={`q-${question.id}`} className="text-sm font-medium">
        {question.question}
      </p>
      {question.options.length > 0 && (
        <form action={action} className="flex flex-wrap gap-2">
          {hidden}
          {question.options.map((o, i) => (
            <button
              key={`${i}-${o}`}
              type="submit"
              name="choice"
              value={o}
              disabled={pending}
              data-question-first={first && i === 0 ? "" : undefined}
              className={`${secondary} rounded-full`}
            >
              {o}
            </button>
          ))}
        </form>
      )}
      {/* A separate form, so Enter in the text box never submits the first chip. */}
      <form
        key={error?.attempt ?? 0}
        action={action}
        className="flex flex-wrap items-end gap-2"
      >
        {hidden}
        <div className="flex flex-col gap-1">
          <label htmlFor={otherId} className="text-xs font-medium">
            {question.options.length > 0 ? "Other answer" : "Your answer"}
          </label>
          <input
            id={otherId}
            name="answer"
            maxLength={300}
            defaultValue={error?.values?.answer ?? ""}
            aria-invalid={error?.errors?.answer ? true : undefined}
            aria-describedby={error ? `${otherId}-error` : undefined}
            data-question-first={
              first && question.options.length === 0 ? "" : undefined
            }
            className={`${field} w-64`}
          />
        </div>
        <button type="submit" disabled={pending} className={secondary}>
          {pending ? "Sending…" : "Send answer"}
        </button>
      </form>
      {error && (
        <p id={`${otherId}-error`} role="alert" className="text-risk text-xs">
          {error.message}
        </p>
      )}
    </div>
  );
}
