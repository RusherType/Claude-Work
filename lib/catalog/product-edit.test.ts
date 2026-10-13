import { describe, expect, it } from "vitest";
import { factsSchema, readFacts } from "./facts";
import {
  editErrors,
  formToProductEdit,
  productEditSchema,
} from "./product-edit";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
};
const BASE = { title: "Crew T-shirt" };
const parse = (entries: Record<string, string>, missing?: string[]) =>
  productEditSchema.safeParse(
    formToProductEdit(form({ ...BASE, ...entries }), missing),
  );

describe("productEditSchema", () => {
  it("turns the form into the columns to update", () => {
    const r = parse({
      description: "100% cotton knit T-shirt",
      tags: "cotton; menswear",
      image_urls: "https://img.test/a.jpg https://img.test/b.jpg",
      origin_country: "cn",
      customs_value: "4.20",
      currency: "usd",
      weight_kg: "0.18",
      material_0_name: "Cotton",
      material_0_percent: "60",
      material_1_name: "Polyester",
      material_1_percent: "40",
      function: "Worn as a T-shirt",
      user: "Men",
      form: "Knitted",
    });
    expect(r.success && r.data).toEqual({
      title: "Crew T-shirt",
      description: "100% cotton knit T-shirt",
      product_type: null,
      vendor: null,
      tags: ["cotton", "menswear"],
      image_urls: ["https://img.test/a.jpg", "https://img.test/b.jpg"],
      origin_country: "CN",
      customs_value: "4.20",
      currency: "USD",
      weight_kg: "0.18",
      facts: {
        materials: [
          { name: "Cotton", percent: "60" },
          { name: "Polyester", percent: "40" },
        ],
        function: "Worn as a T-shirt",
        user: "Men",
        form: "Knitted",
      },
    });
  });

  it("drops the currency when there is no value, and keeps the agent's open questions", () => {
    const r = parse({ currency: "EUR" }, ["Is it knitted or woven?"]);
    expect(r.success && r.data).toMatchObject({
      customs_value: null,
      currency: null,
      facts: { missing: ["Is it knitted or woven?"] },
    });
  });

  it.each([
    [{ title: " " }, "title"],
    [{ customs_value: "4.20" }, "currency"],
    [{ origin_country: "Atlantis" }, "origin_country"],
    [{ weight_kg: "12345678" }, "weight_kg"],
    [{ image_urls: "http://img.test/a.jpg" }, "image_urls"],
    [
      { material_0_name: "Cotton", material_0_percent: "120" },
      "material_0_percent",
    ],
    [{ material_0_percent: "50" }, "material_0_name"],
    [
      {
        material_0_name: "Cotton",
        material_0_percent: "70",
        material_1_name: "Silk",
        material_1_percent: "40",
      },
      "materials",
    ],
    [{ function: "a\u0000b" }, "function"],
  ] as [Record<string, string>, string][])(
    "reports %j on its field",
    (entries, field) => {
      const r = parse(entries);
      expect(r.success).toBe(false);
      if (!r.success) expect(Object.keys(editErrors(r.error))).toContain(field);
    },
  );

  it("adds tenths exactly: 33.3 + 66.7 is 100", () => {
    expect(
      parse({
        material_0_name: "Cotton",
        material_0_percent: "33.3",
        material_1_name: "Wool",
        material_1_percent: "66.7",
      }).success,
    ).toBe(true);
  });
});

describe("readFacts", () => {
  it("reads stored facts and drops anything unexpected", () => {
    expect(
      readFacts({
        materials: [{ name: "Cotton", percent: 100 }, { name: "" }, "junk"],
        function: "T-shirt",
        user: 7,
        extra: true,
        missing: ["Knitted?", 3],
      }),
    ).toEqual({
      materials: [{ name: "Cotton", percent: "100" }],
      function: "T-shirt",
      user: null,
      form: null,
      missing: ["Knitted?"],
    });
    expect(readFacts(null)).toEqual({
      materials: [],
      function: null,
      user: null,
      form: null,
    });
    expect(readFacts([1, 2])).toEqual({
      materials: [],
      function: null,
      user: null,
      form: null,
    });
  });

  it("produces facts the schema accepts", () => {
    expect(
      factsSchema.safeParse(readFacts({ materials: [{ name: "Cotton" }] }))
        .success,
    ).toBe(true);
  });
});
