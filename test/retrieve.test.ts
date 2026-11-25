import { describe, expect, it } from "vitest";
import { apiCacheKey } from "../src/tools/retrieve.js";

describe("apiCacheKey", () => {
  it("uses the bare URL for GET so existing caches stay valid", () => {
    expect(apiCacheKey("GET", "https://api.example.com/items?limit=5", undefined)).toBe(
      "https://api.example.com/items?limit=5",
    );
  });

  it("never collides a non-GET response with the GET cache entry", () => {
    const url = "https://api.example.com/items";
    const get = apiCacheKey("GET", url, undefined);
    const post = apiCacheKey("POST", url, '{"a":1}');
    expect(post).not.toBe(get);
    expect(post).toContain("post");
  });

  it("separates the same method by body", () => {
    const url = "https://api.example.com/items";
    expect(apiCacheKey("POST", url, '{"a":1}')).not.toBe(
      apiCacheKey("POST", url, '{"a":2}'),
    );
  });

  it("separates different methods", () => {
    const url = "https://api.example.com/items";
    expect(apiCacheKey("PUT", url, "x")).not.toBe(apiCacheKey("PATCH", url, "x"));
  });
});
