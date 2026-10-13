import { describe, expect, it } from "vitest";
import {
  formatHtsCode,
  listingHref,
  parseListing,
  searchFilter,
  searchTerm,
} from "./listing";

describe("parseListing", () => {
  it("reads valid filters", () => {
    expect(
      parseListing({
        q: " mug ",
        status: "confirmed",
        origin: "vn",
        chapter: "69",
        page: "3",
      }),
    ).toEqual({
      q: "mug",
      status: "confirmed",
      origin: "VN",
      chapter: "69",
      page: 3,
    });
  });

  it("drops anything invalid instead of failing", () => {
    expect(
      parseListing({
        q: "x".repeat(101),
        status: "approved",
        origin: "Atlantis",
        chapter: "6",
        page: "-2",
      }),
    ).toEqual({
      q: undefined,
      status: undefined,
      origin: undefined,
      chapter: undefined,
      page: 1,
    });
    expect(parseListing({ page: "abc" }).page).toBe(1);
    expect(parseListing({ status: ["confirmed", "queued"] }).status).toBe(
      "confirmed",
    );
    expect(parseListing({})).toEqual({
      q: undefined,
      status: undefined,
      origin: undefined,
      chapter: undefined,
      page: 1,
    });
  });
});

describe("search", () => {
  it("removes characters that would change the filter", () => {
    expect(searchTerm('mug),sku.eq.(x" 100%_*\\')).toBe("mug sku.eq. x 100");
  });

  it("searches title and SKU, and codes when the text is a code", () => {
    expect(searchFilter("mug")).toBe("title.ilike.*mug*,sku.ilike.*mug*");
    expect(searchFilter("6109.10")).toBe(
      "title.ilike.*6109.10*,sku.ilike.*6109.10*,code.like.610910*",
    );
    expect(searchFilter(" ,() ")).toBeNull();
  });
});

describe("listingHref", () => {
  const current = parseListing({ q: "mug", status: "confirmed", page: "4" });

  it("keeps filters and changes the page", () => {
    expect(listingHref(current, { page: 5 })).toBe(
      "/app/catalog?q=mug&status=confirmed&page=5",
    );
    expect(listingHref(current, { page: 1 })).toBe(
      "/app/catalog?q=mug&status=confirmed",
    );
  });

  it("clears filters", () => {
    expect(
      listingHref(current, { q: undefined, status: undefined, page: 1 }),
    ).toBe("/app/catalog");
  });
});

describe("formatHtsCode", () => {
  it("formats 10-digit codes as 6109.10.0012", () => {
    expect(formatHtsCode("6109100012")).toBe("6109.10.0012");
    expect(formatHtsCode("6109")).toBe("6109");
  });
});
