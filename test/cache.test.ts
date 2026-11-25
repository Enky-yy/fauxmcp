import { beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let cache: typeof import("../src/lib/cache.js");
let cacheDir = "";

beforeAll(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "fauxmcp-cache-test-"));
  process.env.FAUX_CACHE_DIR = cacheDir;
  cache = await import("../src/lib/cache.js");
});

describe("slugify", () => {
  it("normalizes names into ids", () => {
    expect(cache.slugify("Hello World!")).toBe("hello-world");
    expect(cache.slugify("  Ünïcode / nämé  ")).toBe("unicode-name");
  });

  it("falls back when nothing usable remains", () => {
    expect(cache.slugify("!!!")).toBe("dataset");
  });
});

describe("dataset cache", () => {
  it("saves, reads, lists, and finds by URL", async () => {
    const meta = await cache.saveDataset({
      name: "My Dataset",
      content: "a,b\n1,2\n",
      format: "csv",
      kind: "fetch",
      sourceUrl: "https://example.com/x.csv",
      rows: 1,
    });

    expect(meta.id).toBe("my-dataset");
    expect(meta.file).toBe("my-dataset.csv");
    expect(meta.bytes).toBeGreaterThan(0);

    const loaded = await cache.getDataset("my-dataset");
    expect(loaded?.content).toContain("1,2");

    const byUrl = await cache.findByUrl("https://example.com/x.csv");
    expect(byUrl?.id).toBe("my-dataset");

    const list = await cache.listDatasets();
    expect(list.map((entry) => entry.id)).toContain("my-dataset");
  });

  it("overwrites same-named datasets but keeps createdAt", async () => {
    const first = await cache.saveDataset({
      name: "My Dataset",
      content: "a,b\n1,2\n",
      format: "csv",
      kind: "fetch",
      rows: 1,
    });
    const second = await cache.saveDataset({
      name: "My Dataset",
      content: "a,b\n3,4\n",
      format: "csv",
      kind: "fetch",
      rows: 1,
    });

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    const reloaded = await cache.getDataset("my-dataset");
    expect(reloaded?.content).toContain("3,4");
  });

  it("returns null for unknown ids", async () => {
    expect(await cache.getDataset("does-not-exist")).toBeNull();
  });

  it("refuses index entries that escape the cache directory", async () => {
    await writeFile(
      path.join(cacheDir, "index.json"),
      JSON.stringify([
        {
          id: "evil",
          name: "evil",
          file: "../outside.csv",
          format: "csv",
          kind: "fetch",
          bytes: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
      "utf8",
    );
    expect(await cache.getDataset("evil")).toBeNull();
  });
});
