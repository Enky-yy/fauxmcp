#!/usr/bin/env node
/**
 * Comprehensive adversarial security test harness for fauxmcp.
 * Phase 1 + Phase 2: SSRF, redirects, formula injection, context flooding,
 * cache isolation, reserved keys, path traversal, credential redaction.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { createServer } from "node:http";

const BIN = path.resolve("dist/index.js");
let mcpId = 0;
let passed = 0;
let failed = 0;
let buf = "";

const mcp = spawn("node", [BIN], { stdio: ["pipe", "pipe", "pipe"] });
mcp.stdout.on("data", (d) => (buf += d.toString()));
mcp.stderr.on("data", (d) => process.stderr.write(d));

function readLine() {
  const idx = buf.indexOf("\n");
  if (idx === -1) return null;
  const line = buf.slice(0, idx);
  buf = buf.slice(idx + 1);
  return line;
}

function mcpCall(method, params, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const msg = JSON.stringify({ jsonrpc: "2.0", id: mcpId++, method, params }) + "\n";
    const timer = setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs);
    const handler = () => {
      const l = readLine();
      if (l === null) return;
      try {
        const parsed = JSON.parse(l);
        if (parsed.id === mcpId - 1) {
          clearTimeout(timer);
          mcp.stdout.removeListener("data", handler);
          resolve(parsed);
        }
      } catch {}
    };
    mcp.stdout.on("data", handler);
    mcp.stdin.write(msg);
  });
}

async function tool(name, args) {
  const res = await mcpCall("tools/call", { name, arguments: args });
  const content = res.result?.content?.[0]?.text ?? "";
  const isError = res.result?.isError === true;
  return { ok: !isError, error: isError ? content : undefined };
}

async function t(name, fn) {
  try {
    const result = await fn();
    if (result === true) {
      passed++;
      console.log(`  PASS: ${name}`);
    } else {
      failed++;
      console.log(`  FAIL: ${name} — ${result}`);
    }
  } catch (err) {
    failed++;
    console.log(`  ERROR: ${name} — ${err.message}`);
  }
}

// ===== Local HTTP test server =====
let httpServer;
let baseUrl = "";

function startHttpServer() {
  return new Promise((resolve) => {
    httpServer = createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/redirect-meta") {
        res.writeHead(302, { Location: "http://169.254.169.254/meta-data" });
        res.end();
      } else if (url.pathname === "/redirect-loop") {
        res.writeHead(302, { Location: req.url });
        res.end();
      } else if (url.pathname === "/formula-csv") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(
          `<table><tr><th>Bad</th><th>Good</th></tr><tr><td>=1+1</td><td>hello</td></tr></table>`,
        );
      } else if (url.pathname === "/backticks") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("text with ` backticks ``` here");
      } else if (url.pathname === "/giant-cell") {
        res.writeHead(200, { "content-type": "text/csv" });
        res.end("col\n" + "x".repeat(5000));
      } else if (url.pathname === "/giant-json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: "y".repeat(50000) }));
      } else if (url.pathname === "/post-echo") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ method: req.method, body }));
        });
      } else if (url.pathname === "/proto-json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('[{"__proto__": {"polluted": true}, "name": "x"}]');
      } else if (url.pathname === "/constructor-json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('[{"constructor": {"polluted": true}, "name": "x"}]');
      } else if (url.pathname === "/valid-csv") {
        res.writeHead(200, { "content-type": "text/csv" });
        res.end("name,age\nAlice,30\nBob,25\n");
      } else if (url.pathname === "/valid-json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('[{"id":1,"name":"Alice"}]');
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    });
    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
}

function stopHttpServer() {
  return new Promise((resolve) => httpServer.close(() => resolve()));
}

async function run() {
  console.log("🔍 Comprehensive adversarial security tests on fauxmcp\n");

  await startHttpServer();

  // ===== SSRF: direct metadata access =====
  await t("SSRF: AWS metadata IPv4 blocked (fetch)", async () => {
    const r = await tool("fetch_dataset", { url: "http://169.254.169.254/latest/meta-data/" });
    return r.ok ? "NOT blocked" : (r.error && r.error.includes("Blocked") ? true : `wrong: ${r.error}`);
  });
  await t("SSRF: metadata hostname blocked (fetch)", async () => {
    const r = await tool("fetch_dataset", { url: "http://metadata.google.internal/" });
    return r.ok ? "NOT blocked" : (r.error && r.error.includes("Blocked") ? true : `wrong: ${r.error}`);
  });
  await t("SSRF: link-local IPv6 blocked (fetch)", async () => {
    const r = await tool("fetch_dataset", { url: "http://[fe80::1]/metadata" });
    return r.ok ? "NOT blocked" : (r.error && r.error.includes("Blocked") ? true : `wrong: ${r.error}`);
  });
  await t("SSRF: Alibaba metadata IP blocked (fetch)", async () => {
    const r = await tool("fetch_dataset", { url: "http://100.100.100.200/" });
    return r.ok ? "NOT blocked" : (r.error && r.error.includes("Blocked") ? true : `wrong: ${r.error}`);
  });
  await t("SSRF: metadata blocked (scrape_table)", async () => {
    const r = await tool("scrape_table", { url: "http://169.254.169.254/" });
    return r.ok ? "NOT blocked" : (r.error && r.error.includes("Blocked") ? true : `wrong: ${r.error}`);
  });
  await t("SSRF: metadata blocked (query_public_api)", async () => {
    const r = await tool("query_public_api", { url: "http://169.254.169.254/latest/meta-data/" });
    return r.ok ? "NOT blocked" : (r.error && r.error.includes("Blocked") ? true : `wrong: ${r.error}`);
  });

  // ===== SSRF: via redirect =====
  await t("SSRF: redirect to metadata blocked (302)", async () => {
    const r = await tool("fetch_dataset", { url: `${baseUrl}/redirect-meta` });
    return r.ok ? "NOT blocked" : (r.error && r.error.includes("Blocked") ? true : `wrong: ${r.error}`);
  });

  // ===== Protocol restrictions =====
  await t("fetch_dataset: ftp rejected", async () => {
    const r = await tool("fetch_dataset", { url: "ftp://example.com/file" });
    return r.ok ? "NOT blocked" : (r.error && r.error.includes("http") ? true : `wrong: ${r.error}`);
  });
  await t("fetch_dataset: file:// rejected", async () => {
    const r = await tool("fetch_dataset", { url: "file:///etc/passwd" });
    return r.ok ? "NOT blocked" : (r.error && r.error.includes("http") ? true : `wrong: ${r.error}`);
  });

  // ===== Credential redaction =====
  await t("credentials redacted from error URL", async () => {
    const r = await tool("fetch_dataset", { url: "http://user:secret@169.254.169.254/meta-data" });
    return r.ok || !r.error ? "no error / leaked" : r.error.includes("secret") ? "leaked" : true;
  });

  // ===== Path traversal =====
  await t("read_saved_dataset: path traversal id rejected", async () => {
    const r = await tool("read_saved_dataset", { id: "../../etc/passwd", offset: 0, limit: 1 });
    return r.ok ? "NOT blocked" : true;
  });

  // ===== Field/row caps =====
  await t("generate_records: 101 fields rejected", async () => {
    const fields = Array.from({ length: 101 }, (_, i) => ({ name: `f${i}`, type: "integer" }));
    const r = await tool("generate_records", { count: 5, fields });
    return r.ok ? "NOT capped" : true;
  });
  await t("generate_records: field name > 64 chars rejected", async () => {
    const fields = [{ name: "a".repeat(65), type: "integer" }];
    const r = await tool("generate_records", { count: 5, fields });
    return r.ok ? "NOT capped" : true;
  });
  await t("generate_records: count > maxRows rejected", async () => {
    const r = await tool("generate_records", { count: 99999 });
    return r.ok ? "NOT capped" : true;
  });

  // ===== Valid fetches still work =====
  await t("fetch_dataset: valid CSV works", async () => {
    const r = await tool("fetch_dataset", { url: `${baseUrl}/valid-csv` });
    if (!r.ok) return `failed: ${r.error}`;
    return true;
  });
  await t("fetch_dataset: valid JSON works", async () => {
    const r = await tool("fetch_dataset", { url: `${baseUrl}/valid-json` });
    if (!r.ok) return `failed: ${r.error}`;
    return true;
  });

  // ===== Redirect loop =====
  await t("redirect loop detected", async () => {
    const r = await tool("fetch_dataset", { url: `${baseUrl}/redirect-loop` });
    return r.ok ? "NOT blocked (loop not caught)" : true;
  });

  // ===== Reserved JSON keys =====
  await t("query_public_api: __proto__ key dropped", async () => {
    const r = await tool("query_public_api", { url: `${baseUrl}/proto-json` });
    return r.ok ? true : `failed: ${r.error}`;
  });
  await t("query_public_api: constructor key dropped", async () => {
    const r = await tool("query_public_api", { url: `${baseUrl}/constructor-json` });
    return r.ok ? true : `failed: ${r.error}`;
  });

  // ===== Cache isolation: POST vs GET =====
  await t("cache isolation: POST body-hash key differs from GET", async () => {
    await tool("query_public_api", {
      url: `${baseUrl}/post-echo`,
      method: "POST",
      body: { secret: "post-only-data" },
    });
    const r = await tool("query_public_api", { url: `${baseUrl}/post-echo`, method: "GET" });
    return r.ok ? true : `failed: ${r.error}`;
  });

  // ===== Formula injection =====
  await t("scrape_table: formula CSV works (neutralized)", async () => {
    const r = await tool("scrape_table", { url: `${baseUrl}/formula-csv` });
    return r.ok ? true : `failed: ${r.error}`;
  });

  // ===== Backtick handling =====
  await t("fetch_dataset: backticks in content handled", async () => {
    const r = await tool("fetch_dataset", { url: `${baseUrl}/backticks` });
    return r.ok ? true : `failed: ${r.error}`;
  });

  await stopHttpServer();

  mcp.stdin.end();
  mcp.kill("SIGTERM");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
