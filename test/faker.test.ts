import { describe, expect, it } from "vitest";
import { generateRows, PRESETS, type FieldSpec } from "../src/lib/faker.js";

describe("generateRows", () => {
  it("is reproducible with a seed", () => {
    const a = generateRows(PRESETS.people, 5, "en", 42);
    const b = generateRows(PRESETS.people, 5, "en", 42);
    expect(a).toEqual(b);
  });

  it("produces different data with different seeds", () => {
    const a = generateRows(PRESETS.people, 3, "en", 1);
    const b = generateRows(PRESETS.people, 3, "en", 2);
    expect(a).not.toEqual(b);
  });

  it("generates the requested number of rows and all fields", () => {
    const rows = generateRows(PRESETS.products, 7, "en", 5);
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(Object.keys(row)).toEqual(PRESETS.products.map((field) => field.name));
    }
  });

  it("supports locales", () => {
    const rows = generateRows(PRESETS.people, 25, "ja", 9);
    expect(rows).toHaveLength(25);
    expect(rows.every((row) => typeof row.first_name === "string")).toBe(true);
  });

  it("respects min/max bounds for integers", () => {
    const fields: FieldSpec[] = [{ name: "n", type: "integer", min: 10, max: 12 }];
    const rows = generateRows(fields, 50, "en", 3);
    for (const row of rows) {
      expect(row.n).toBeGreaterThanOrEqual(10);
      expect(row.n).toBeLessThanOrEqual(12);
    }
  });

  it("increments id fields sequentially", () => {
    const rows = generateRows([{ name: "id", type: "id" }], 3, "en", 1);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
  });

  it("throws when an enum has no values", () => {
    expect(() => generateRows([{ name: "x", type: "enum" }], 1, "en", 1)).toThrow(
      /no "values"/,
    );
  });

  it("supports enum and constant fields", () => {
    const rows = generateRows(
      [
        { name: "status", type: "enum", values: ["a", "b"] },
        { name: "fixed", type: "constant", value: "yes" },
      ],
      20,
      "en",
      11,
    );
    expect(rows.every((row) => row.status === "a" || row.status === "b")).toBe(true);
    expect(rows.every((row) => row.fixed === "yes")).toBe(true);
  });
});
