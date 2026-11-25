#!/usr/bin/env node
/**
 * End-to-end smoke test: spins up a local HTTP server with sample CSV / JSON /
 * HTML / REST endpoints, launches the built fauxmcp server over stdio, and
 * exercises every tool family.
 *
 *   npm run build && node scripts/smoke.mjs
 */
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const httpServer = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  switch (url.pathname) {
    case "/data.csv":
      res.writeHead(200, { "content-type": "text/csv" });
      res.end("name,age,city\nAlice,30,Berlin\nBob,25,Paris\nCara,41,Tokyo\n");
      break;
    case "/data.json":
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ id: 1, title: "First" }, { id: 2, title: "Second" }]));
      break;
    case "/page.html":
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<html><body><h1>Test</h1>
        <table><caption>People</caption>
          <tr><th>Name</th><th>Role</th></tr>
          <tr><td>Alice</td><td>Engineer</td></tr>
          <tr><td>Bob</td><td>Designer</td></tr>
        </table>
        <table><tr><th>City</th></tr><tr><td>Berlin</td></tr></table>
      </body></html>`);
      break;
    case "/api": {
      const limit = Number(url.searchParams.get("limit") ?? 10);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          results: Array.from({ length: limit }, (_, i) => ({
            id: i + 1,
            name: `Item ${i + 1}`,
          })),
        }),
      );
      break;
    }
    default:
      res.writeHead(404);
      res.end("not found");
  }
});

await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
const port = httpServer.address().port;
const base = `http://127.0.0.1:${port}`;
const cacheDir = await mkdtemp(path.join(tmpdir(), "fauxmcp-smoke-"));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve("dist/index.js")],
  env: {
    ...getDefaultEnvironment(),
    FAUX_CACHE_DIR: cacheDir,
    FAUX_PREVIEW_ROWS: "5",
    FAUX_MAX_ROWS: "500",
  },
  stderr: "inherit",
});

const client = new Client({ name: "fauxmcp-smoke", version: "0.0.0" });
await client.connect(transport);

let failures = 0;

function show(label, result) {
  const text = (result.content ?? [])
    .map((chunk) => (chunk.type === "text" ? chunk.text : `[${chunk.type}]`))
    .join("\n");
  const flag = result.isError ? "❌" : "✅";
  if (result.isError) failures++;
  console.log(`\n${flag} ${label}\n${"-".repeat(60)}\n${text.slice(0, 900)}`);
  return result;
}

async function call(name, args) {
  return show(name, await client.callTool({ name, arguments: args }));
}

const tools = await client.listTools();
console.log(`Registered tools (${tools.tools.length}):`);
console.log(tools.tools.map((tool) => `  - ${tool.name}`).join("\n"));

await call("generate_people", { count: 6, seed: 42, format: "markdown" });

await call("generate_records", {
  count: 3,
  fields: [
    { name: "id", type: "id" },
    { name: "email", type: "email" },
    { name: "status", type: "enum", values: ["active", "paused"] },
  ],
  format: "sql",
  table_name: "users",
});

await call("generate_json", {
  count: 2,
  preset: "products",
  seed: 7,
  format: "json",
});

await call("generate_email", { count: 2, provider: "example.com" });

await call("fetch_dataset", { url: `${base}/data.csv`, name: "people-csv" });
await call("fetch_dataset", { url: `${base}/data.csv`, name: "people-csv" });
await call("fetch_dataset", { url: `${base}/data.json`, name: "titles-json" });

await call("scrape_table", { url: `${base}/page.html` });
await call("scrape_table", { url: `${base}/page.html`, all_tables: true });

await call("query_public_api", { url: `${base}/api`, params: { limit: 2 } });

await call("list_saved_datasets", {});
await call("read_saved_dataset", { id: "people-csv", limit: 2 });

const resources = await client.listResources();
console.log(`\nRegistered resources (${resources.resources.length}):`);
console.log(resources.resources.map((resource) => `  - ${resource.uri}`).join("\n"));

const index = await client.readResource({ uri: "fauxmcp://datasets" });
console.log(
  `\n✅ read fauxmcp://datasets (${index.contents[0]?.text?.length ?? 0} chars)`,
);

await client.close();
httpServer.close();

if (failures > 0) {
  console.error(`\n${failures} tool call(s) failed.`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
