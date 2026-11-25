import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { FetchLimitError, guardedFetch } from "../src/lib/fetch.js";

let server: Server;
let base = "";
const BODY = "x".repeat(2048);

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/slow") {
      const timer = setTimeout(() => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("late");
      }, 500);
      req.on("close", () => clearTimeout(timer));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(BODY);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address && typeof address === "object") {
    base = `http://127.0.0.1:${address.port}`;
  }
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("guardedFetch", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(guardedFetch("ftp://example.com/file")).rejects.toThrow(/http/);
    await expect(guardedFetch("file:///etc/passwd")).rejects.toThrow(/http/);
  });

  it("rejects invalid URLs", async () => {
    await expect(guardedFetch("not a url")).rejects.toThrow(/Invalid URL/);
  });

  it("fetches small responses", async () => {
    const result = await guardedFetch(base, {}, { maxBytes: 10_000 });
    expect(result.bytes).toBe(BODY.length);
    expect(result.text).toHaveLength(BODY.length);
    expect(result.contentType).toContain("text/plain");
  });

  it("enforces the byte cap", async () => {
    await expect(guardedFetch(base, {}, { maxBytes: 100 })).rejects.toBeInstanceOf(
      FetchLimitError,
    );
  });

  it("enforces the timeout", async () => {
    await expect(guardedFetch(`${base}/slow`, {}, { timeoutMs: 20 })).rejects.toThrow(
      /timed out/,
    );

    // Give the aborted request a moment to settle before the suite exits.
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
