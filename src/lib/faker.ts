import { allFakers, type Faker } from "@faker-js/faker";

export const SUPPORTED_LOCALES: string[] = Object.keys(allFakers).sort();

export const FIELD_TYPES = [
  "id",
  "uuid",
  "firstName",
  "lastName",
  "fullName",
  "username",
  "email",
  "phone",
  "avatar",
  "city",
  "country",
  "countryCode",
  "streetAddress",
  "zipCode",
  "latitude",
  "longitude",
  "company",
  "jobTitle",
  "department",
  "url",
  "domainName",
  "ipv4",
  "emoji",
  "color",
  "productName",
  "integer",
  "float",
  "boolean",
  "date",
  "datetime",
  "time",
  "price",
  "amount",
  "currencyCode",
  "word",
  "sentence",
  "paragraph",
  "isbn",
  "creditCardNumber",
  "iban",
  "enum",
  "constant",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldSpec {
  name: string;
  type: FieldType;
  /** Values to pick from when `type` is `enum` (required for enums). */
  values?: Array<string | number | boolean>;
  /** Fixed value when `type` is `constant` (required for constants). */
  value?: string | number | boolean;
  /** Inclusive lower bound for numeric field types. */
  min?: number;
  /** Inclusive upper bound for numeric field types. */
  max?: number;
}

export type Row = Record<string, string | number | boolean>;

export const PRESETS: Record<string, FieldSpec[]> = {
  people: [
    { name: "id", type: "id" },
    { name: "first_name", type: "firstName" },
    { name: "last_name", type: "lastName" },
    { name: "email", type: "email" },
    { name: "phone", type: "phone" },
    { name: "job_title", type: "jobTitle" },
    { name: "company", type: "company" },
    { name: "city", type: "city" },
    { name: "country", type: "country" },
    { name: "created_at", type: "datetime" },
  ],
  products: [
    { name: "id", type: "id" },
    { name: "sku", type: "uuid" },
    { name: "name", type: "productName" },
    { name: "department", type: "department" },
    {
      name: "category",
      type: "enum",
      values: ["electronics", "clothing", "home", "books", "sports", "toys", "beauty", "grocery"],
    },
    { name: "price", type: "price" },
    { name: "stock", type: "integer", min: 0, max: 500 },
    { name: "is_active", type: "boolean" },
  ],
  orders: [
    { name: "order_id", type: "uuid" },
    { name: "customer_email", type: "email" },
    { name: "amount", type: "amount" },
    { name: "currency", type: "currencyCode" },
    {
      name: "status",
      type: "enum",
      values: ["pending", "paid", "shipped", "delivered", "cancelled", "refunded"],
    },
    { name: "created_at", type: "datetime" },
  ],
  companies: [
    { name: "id", type: "id" },
    { name: "name", type: "company" },
    { name: "domain", type: "domainName" },
    { name: "city", type: "city" },
    { name: "country", type: "country" },
    { name: "employees", type: "integer", min: 1, max: 100_000 },
  ],
};

export const PRESET_NAMES = ["people", "products", "orders", "companies"] as const;

export type PresetName = (typeof PRESET_NAMES)[number];

/** Resolve a locale name to a Faker instance, falling back to English. */
export function getFaker(locale?: string, seed?: number): Faker {
  const key = (locale ?? "en") as keyof typeof allFakers;
  const faker = allFakers[key] ?? allFakers.en;
  if (seed !== undefined) faker.seed(seed);
  return faker;
}

/** Reference instant for seeded date generation (keeps seeds fully reproducible). */
const SEEDED_REFERENCE = new Date("2026-01-01T12:00:00.000Z");

function boundedMin(spec: FieldSpec, fallback: number): number {
  return spec.min ?? fallback;
}

function boundedMax(spec: FieldSpec, fallback: number): number {
  return spec.max ?? fallback;
}

/** Generate a single field value for the given row index. */
export function generateField(
  faker: Faker,
  spec: FieldSpec,
  index: number,
  reference: Date = new Date(),
): string | number | boolean {
  switch (spec.type) {
    case "id":
      return index + 1;
    case "constant":
      return spec.value ?? "";
    case "enum": {
      const values = spec.values ?? [];
      if (values.length === 0) {
        throw new Error(`Field "${spec.name}" has type "enum" but no "values" were provided.`);
      }
      return faker.helpers.arrayElement(values);
    }
    case "firstName":
      return faker.person.firstName();
    case "lastName":
      return faker.person.lastName();
    case "fullName":
      return faker.person.fullName();
    case "username":
      return faker.internet.username();
    case "email":
      return faker.internet.email();
    case "phone":
      return faker.phone.number();
    case "avatar":
      return faker.image.avatar();
    case "city":
      return faker.location.city();
    case "country":
      return faker.location.country();
    case "countryCode":
      return faker.location.countryCode();
    case "streetAddress":
      return faker.location.streetAddress();
    case "zipCode":
      return faker.location.zipCode();
    case "latitude":
      return faker.location.latitude();
    case "longitude":
      return faker.location.longitude();
    case "company":
      return faker.company.name();
    case "jobTitle":
      return faker.person.jobTitle();
    case "department":
      return faker.commerce.department();
    case "url":
      return faker.internet.url();
    case "domainName":
      return faker.internet.domainName();
    case "ipv4":
      return faker.internet.ipv4();
    case "emoji":
      return faker.internet.emoji();
    case "color":
      return faker.color.human();
    case "productName":
      return faker.commerce.productName();
    case "integer":
      return faker.number.int({
        min: boundedMin(spec, 0),
        max: boundedMax(spec, 10_000),
      });
    case "float":
      return faker.number.float({
        min: boundedMin(spec, 0),
        max: boundedMax(spec, 10_000),
        fractionDigits: 2,
      });
    case "boolean":
      return faker.datatype.boolean();
    case "date":
      return faker.date.past({ years: 1, refDate: reference }).toISOString().slice(0, 10);
    case "datetime":
      return faker.date.recent({ days: 30, refDate: reference }).toISOString();
    case "time":
      return faker.date.recent({ days: 1, refDate: reference }).toISOString().slice(11, 19);
    case "price":
      return faker.commerce.price({
        min: boundedMin(spec, 1),
        max: boundedMax(spec, 1000),
      });
    case "amount":
      return faker.finance.amount({
        min: boundedMin(spec, 0),
        max: boundedMax(spec, 10_000),
        dec: 2,
      });
    case "currencyCode":
      return faker.finance.currencyCode();
    case "word":
      return faker.lorem.word();
    case "sentence":
      return faker.lorem.sentence();
    case "paragraph":
      return faker.lorem.paragraph();
    case "uuid":
      return faker.string.uuid();
    case "isbn":
      return faker.commerce.isbn();
    case "creditCardNumber":
      return faker.finance.creditCardNumber();
    case "iban":
      return faker.finance.iban();
    default: {
      const exhaustive: never = spec.type;
      throw new Error(`Unsupported field type: ${String(exhaustive)}`);
    }
  }
}

/** Generate `count` rows for the given field specs. */
export function generateRows(fields: FieldSpec[], count: number, locale?: string, seed?: number): Row[] {
  const faker = getFaker(locale, seed);
  const reference = seed !== undefined ? SEEDED_REFERENCE : new Date();
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const row: Row = {};
    for (const spec of fields) {
      row[spec.name] = generateField(faker, spec, i, reference);
    }
    rows.push(row);
  }
  return rows;
}
