# fauxmcp

[![CI](https://github.com/Enky-yy/fauxmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Enky-yy/fauxmcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/fauxmcp.svg)](https://www.npmjs.com/package/fauxmcp)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **One MCP for all your data.** Generate realistic fake data, fetch real datasets from any URL,
> scrape HTML tables, and query public APIs — all cached locally so you never knock on the same
> website twice.

`fauxmcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server for developers,
data folks, and anyone tired of bouncing between Mockaroo, data.gov, GitHub raw files, and
one-off scraping scripts just to get a table of data.

## Why fauxmcp?

| Without fauxmcp | With fauxmcp |
| --- | --- |
| Open Mockaroo, click around, copy-paste, reformat | *"Generate 100 fake users as SQL inserts"* |
| Download CSVs from five different portals | *"Fetch this CSV and show me the columns"* |
| Write a scraper for a Wikipedia table | *"Scrape table 2 from this page"* |
| Re-download the same file every session | Datasets are cached and reusable as MCP resources |

## Quick start

```bash
npx -y fauxmcp
```

Or install globally:

```bash
npm install -g fauxmcp
fauxmcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fauxmcp": {
      "command": "npx",
      "args": ["-y", "fauxmcp"],
      "env": {
        "FAUX_MAX_ROWS": "5000"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` (project) or the global MCP config:

```json
{
  "mcpServers": {
    "fauxmcp": {
      "command": "npx",
      "args": ["-y", "fauxmcp"]
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "fauxmcp": {
      "command": "npx",
      "args": ["-y", "fauxmcp"]
    }
  }
}
```

## Tools

### 🎲 Generate fake data

| Tool | What it does |
| --- | --- |
| `generate_people` | Realistic people: name, email, phone, job, company, city, country, timestamps |
| `generate_records` | Schema-driven rows — describe your fields, get data in JSON / CSV / TSV / SQL / Markdown |
| `generate_json` | Pretty-printed JSON fixtures for API mocks and frontend dev |
| `generate_csv` | CSV ready for spreadsheets and database imports |
| `generate_sql` | `CREATE TABLE` + `INSERT` statements with inferred column types |
| `generate_email` | One or many email addresses, optionally on a fixed domain |
| `generate_address` | Postal addresses (street, city, state, zip, country) |
| `generate_phone` | Phone numbers, locale-aware |

**Field types include:** `firstName`, `lastName`, `fullName`, `email`, `username`, `phone`,
`city`, `country`, `streetAddress`, `zipCode`, `latitude`, `longitude`, `company`, `jobTitle`,
`url`, `domainName`, `ipv4`, `uuid`, `id`, `integer`, `float`, `boolean`, `date`, `datetime`,
`time`, `price`, `amount`, `currencyCode`, `word`, `sentence`, `paragraph`, `isbn`,
`creditCardNumber`, `iban`, `enum`, `constant`, and more.

Built-in presets: `people`, `products`, `orders`, `companies`.

### 🌐 Retrieve real data

| Tool | What it does |
| --- | --- |
| `fetch_dataset` | Download CSV / TSV / JSON from any http(s) URL, parse it, preview rows, cache the file |
| `scrape_table` | Extract HTML `<table>` elements from a page into structured rows (and save as CSV) |
| `query_public_api` | Call a REST API with params / headers / body, preview the JSON, cache the response |
| `list_saved_datasets` | Browse everything cached locally |
| `read_saved_dataset` | Page through a cached dataset without re-downloading it |

### 📚 Resources

Every cached dataset is also exposed as an MCP resource:

- `fauxmcp://datasets` — JSON index of all datasets
- `fauxmcp://datasets/{id}` — the raw dataset file

## Example prompts

```text
Generate 50 fake users for my test database, with reproducible data (seed 42).

Give me a SQL INSERT script for a `products` table with 20 rows.

Create 10 JSON objects shaped like {id, email, status} for my API mock.

Fetch https://raw.githubusercontent.com/.../countries.csv and show me the first rows.

Scrape the tables from https://en.wikipedia.org/wiki/List_of_countries_by_population_(United_Nations)
and save the first one as CSV.

Query https://api.example.com/v1/items?limit=5 and summarize the response.

List my saved datasets, then show me the last 10 rows of `people-csv`.
```

## Large results & caching

Tool responses stay small by design: you get a **preview table** plus a summary. When a result
is larger than the preview window, the full file is written to the local cache and you get an
id to page through it later:

```text
📦 Saved as `people` (1000 rows, 142.3 KB) — read it with `read_saved_dataset`
   or `fauxmcp://datasets/people`.
```

Cache location: `~/.fauxmcp/datasets` (override with `FAUX_CACHE_DIR`).

## Configuration

Every guardrail is an environment variable, so the defaults protect you without hard-blocking
you:

| Variable | Default | Purpose |
| --- | --- | --- |
| `FAUX_MAX_ROWS` | `1000` | Max rows per generation call |
| `FAUX_MAX_SIZE_MB` | `10` | Max download size |
| `FAUX_FETCH_TIMEOUT_MS` | `30000` | Fetch timeout |
| `FAUX_PREVIEW_ROWS` | `20` | Rows shown inline in responses |
| `FAUX_PREVIEW_CHARS` | `8000` | Character cap for any inline preview |
| `FAUX_MAX_CELL_CHARS` | `300` | Character cap per preview table cell |
| `FAUX_MAX_TABLES` | `10` | Max HTML tables scraped per page |
| `FAUX_CACHE_DIR` | `~/.fauxmcp/datasets` | Dataset cache directory |
| `FAUX_ALLOW_METADATA` | unset | Set to `1` to allow fetches to cloud metadata / link-local hosts |

## Reproducibility

Pass a `seed` to any generation tool and the same seed yields the same data — great for test
fixtures. Note that seeded timestamps are anchored to a fixed reference date so they stay stable
across runs; omit the seed to get data relative to *now*.

## Safety & limits

- **Context protection** — huge tool outputs would flood the model's context, so previews are
  capped by rows, columns, per-cell characters, and total characters. Larger files are written
  to the cache instead of being echoed back.
- **Memory & disk protection** — downloads are capped at 10 MB (configurable) with streaming
  byte counting; generated rows and schema fields are capped too.
- **Hang protection** — every request has a timeout, redirects are limited to 5 hops, and stdio
  MCP calls are serialized.
- **SSRF protection** — only `http://` and `https://` are allowed (including after every
  redirect), and cloud metadata / link-local hosts (`169.254.169.254`, `metadata.google.internal`,
  `fd00:ec2::254`, `fe80::/10`, …) are blocked by default. Loopback and private ranges stay
  allowed so local dev servers work. Set `FAUX_ALLOW_METADATA=1` to opt out.
- **CSV formula injection** — scraped HTML tables are saved with leading `=`, `+`, `-`, and `@`
  characters neutralized so opening the CSV in a spreadsheet cannot execute formulas. Fetched
  files are stored byte-for-byte and are *not* rewritten; treat downloaded CSV/TSV as untrusted.
- **Cache isolation** — GET and non-GET API responses use distinct cache keys; only GET
  responses are ever served from the cache. Cache files are created with `0600` permissions in a
  `0700` directory, and index entries cannot point outside the cache directory.
- **Prompt-injection surface** — caps turn a malicious "download 10 GB" instruction into a
  harmless error, and URLs in error messages are stripped of embedded credentials.
- **Synthetic data only** — generated credit-card, IBAN, and phone values look realistic and may
  pass format validators. They are not real and must never be used as actual payment or identity
  data.
- **Scraping** works on server-rendered HTML only. Pages that build tables with JavaScript are
  not supported (no headless browser). Respect each site's terms of service.

## Development

```bash
npm install
npm run build        # compile to dist/
npm test             # unit tests (vitest)
npm run smoke        # end-to-end test against local CSV/JSON/HTML/REST fixtures
npm run inspector    # open the MCP Inspector against the built server
```

Project layout:

```text
src/
├── index.ts          # stdio entry point
├── server.ts         # server factory + instructions
├── resources.ts      # fauxmcp:// resources
├── lib/              # env, faker, format, fetch, cache, html, result
└── tools/
    ├── generate.ts   # generation tools
    └── retrieve.ts   # fetch / scrape / query / cache tools
```

CI (`.github/workflows/ci.yml`) runs typecheck + unit tests on Node 22/24/26, the end-to-end
smoke test, and a publishable-tarball check on every push and pull request.

## License

MIT

Security issues: please follow [SECURITY.md](SECURITY.md) and report privately.
