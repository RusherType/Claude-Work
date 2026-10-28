import { describe, expect, it } from "vitest";
import {
  answerSchema,
  confirmSchema,
  decisionMessage,
  htsInput,
  overrideSchema,
  readReturn,
  returnPath,
} from "./decisions";

const P = "6f1c1f43-3d8f-4f0c-9a59-0a3c8d0f4b11";
const C = "0b6a3c1e-5f5d-4b9e-8a2a-6d1f2c3b4a59";
const HASH = "a".repeat(64);

describe("htsInput", () => {
  it.each(["6109.10.0012", "6109 10 0012", "6109100012", " 6109.10.0012 "])(
    "reads %j as 6109100012",
    (input) => {
      expect(htsInput.parse(input)).toBe("6109100012");
    },
  );
  it.each(["6109.10", "61091000123", "6109-10-0012", "abcd100012", ""])(
    "refuses %j",
    (input) => {
      expect(htsInput.safeParse(input).success).toBe(false);
    },
  );
});

describe("overrideSchema", () => {
  const base = {
    productId: P,
    expectedId: C,
    expectedCode: "6109100012",
    expectedStatus: "suggested",
    code: "6109.10.0040",
    reason: " Printed, not all white ",
    contentHash: HASH,
  };

  it("normalises the code and the reason", () => {
    expect(overrideSchema.parse(base)).toEqual({
      ...base,
      code: "6109100040",
      reason: "Printed, not all white",
    });
  });

  it("treats an empty expected id, code and status as no current code", () => {
    expect(
      overrideSchema.parse({
        ...base,
        expectedId: "",
        expectedCode: "",
        expectedStatus: "",
      }),
    ).toMatchObject({
      expectedId: null,
      expectedCode: null,
      expectedStatus: null,
    });
  });

  it.each([
    [{ reason: "ok" }, "reason"],
    [{ reason: "   " }, "reason"],
    [{ reason: "bad\u0001reason" }, "reason"],
    [{ reason: "x".repeat(501) }, "reason"],
    [{ code: "6109.10" }, "code"],
    [{ expectedId: "not-a-uuid" }, "expectedId"],
    [{ contentHash: "abc" }, "contentHash"],
    [{ expectedStatus: "approved" }, "expectedStatus"],
    [{ expectedCode: "x".repeat(21) }, "expectedCode"],
  ] as [Record<string, string>, string][])(
    "refuses %j on %s",
    (patch, field) => {
      const r = overrideSchema.safeParse({ ...base, ...patch });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].path[0]).toBe(field);
    },
  );

  it("sends the shown code back as stored, even when it is malformed", () => {
    for (const shown of ["61091000", "6109.10.0012"])
      expect(
        overrideSchema.parse({ ...base, expectedCode: shown }).expectedCode,
      ).toBe(shown);
    expect(
      confirmSchema.parse({
        classificationId: C,
        productId: P,
        code: "6109.10.0012",
        contentHash: HASH,
      }).code,
    ).toBe("6109.10.0012");
  });

  it("counts characters like the database (3 emoji are 3 characters)", () => {
    expect(
      overrideSchema.safeParse({ ...base, reason: "😀😀😀" }).success,
    ).toBe(true);
    expect(overrideSchema.safeParse({ ...base, reason: "😀😀" }).success).toBe(
      false,
    );
  });
});

describe("confirmSchema and answerSchema", () => {
  it("need ids and a content hash or an answer", () => {
    expect(
      confirmSchema.safeParse({
        classificationId: C,
        productId: P,
        code: "6109100012",
        contentHash: HASH,
      }).success,
    ).toBe(true);
    for (const patch of [{ classificationId: "x" }, { code: "" }])
      expect(
        confirmSchema.safeParse({
          classificationId: C,
          productId: P,
          code: "6109100012",
          contentHash: HASH,
          ...patch,
        }).success,
      ).toBe(false);
    expect(
      answerSchema.parse({ questionId: C, productId: P, answer: " Knitted " })
        .answer,
    ).toBe("Knitted");
    expect(
      answerSchema.safeParse({ questionId: C, productId: P, answer: " " })
        .success,
    ).toBe(false);
    expect(
      answerSchema.parse({
        questionId: C,
        productId: P,
        classificationId: "",
        answer: "Knitted",
      }).classificationId,
    ).toBeUndefined();
    expect(
      answerSchema.safeParse({
        questionId: C,
        productId: P,
        classificationId: "1 or 1=1",
        answer: "Knitted",
      }).success,
    ).toBe(false);
  });
});

describe("returning after a decision", () => {
  it("goes to the next queue item, or back to the product", () => {
    const review = readReturn({ from: "review", nextId: C });
    expect(returnPath(review, P, "confirmed")).toBe(
      `/app/review?at=${C}&done=confirmed`,
    );
    expect(returnPath(readReturn({ from: "review" }), P, "confirmed")).toBe(
      "/app/review?done=confirmed",
    );
    expect(returnPath(review, P, "answered", P)).toBe(
      `/app/review?at=${P}&done=answered`,
    );
    expect(returnPath(readReturn({ from: "product" }), P, "overridden")).toBe(
      `/app/catalog/${P}?decided=overridden`,
    );
  });

  it("never follows an unexpected target", () => {
    const targets: Record<string, string>[] = [
      { from: "review", nextId: "//evil.example" },
      { from: "https://evil.example" },
      {},
    ];
    for (const fields of targets)
      expect(returnPath(readReturn(fields), P, "confirmed")).toBe(
        `/app/catalog/${P}?decided=confirmed`,
      );
  });
});

describe("decisionMessage", () => {
  it("explains each refusal in plain words", () => {
    expect(decisionMessage("confirm", { code: "42501" }).message).toMatch(
      /can't change codes in this workspace/,
    );
    expect(
      decisionMessage("answer", {
        code: "42501",
        message: "not_authenticated",
      }).message,
    ).toMatch(/session has ended/);
    expect(
      decisionMessage("override", { code: "P0001", message: "broker_verified" })
        .message,
    ).toMatch(/Only an owner or admin/);
    expect(
      decisionMessage("confirm", { code: "P0001", message: "stale" }).message,
    ).toMatch(/changed since you opened it/);
    expect(
      decisionMessage("override", { code: "P0001", message: "unknown_code" }),
    ).toMatchObject({ field: "code" });
    expect(
      decisionMessage("confirm", { code: "P0001", message: "unknown_code" }),
    ).not.toHaveProperty("field");
    expect(
      decisionMessage("answer", { code: "P0001", message: "already_answered" })
        .message,
    ).toMatch(/already answered/);
    expect(decisionMessage("confirm", { code: "08006" }).message).toMatch(
      /Try again/,
    );
  });
});
