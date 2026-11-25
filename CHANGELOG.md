# Changelog

All notable changes to fauxmcp will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-11-26

### Added

- **TypeScript declaration files** — `tsconfig` now emits `.d.ts` files alongside compiled JavaScript, so downstream consumers get full type safety.
- **`main` field in `package.json`** — points to `dist/index.js` so Node can resolve the package entry point.
- **CHANGELOG.md** — this file, tracking all future releases.

### Changed

- Bumped version from `0.1.0` to `0.2.0`.

## [0.1.0] — 2026-11-26

### Added

- Initial release of fauxmcp — a Model Context Protocol server for generating fake data and retrieving real datasets.
- **13 MCP tools**: `generate_people`, `generate_records`, `generate_json`, `generate_csv`, `generate_sql`, `generate_email`, `generate_address`, `generate_phone`, `fetch_dataset`, `scrape_table`, `query_public_api`, `list_saved_datasets`, `read_saved_dataset`.
- **2 MCP resources**: `fauxmcp://datasets` (index) and `fauxmcp://datasets/{id}` (template).
- **Built-in presets**: `people`, `products`, `orders`, `companies`.
- **Seedable generation** — same seed yields same data for reproducible test fixtures.
- **Dataset caching** — downloads and large results saved locally with `0700` directory and `0600` file permissions.
- **Guardrails** (all env-overridable): `FAUX_MAX_ROWS`, `FAUX_MAX_SIZE_MB`, `FAUX_FETCH_TIMEOUT_MS`, `FAUX_PREVIEW_ROWS`, `FAUX_MAX_CELL_CHARS`, `FAUX_PREVIEW_CHARS`, `FAUX_MAX_TABLES`, `FAUX_CACHE_DIR`.
- **SSRF protection** — cloud metadata and link-local hosts blocked by default (`FAUX_ALLOW_METADATA=1` to opt out).
- **CSV formula neutralization** for scraped HTML tables.
- **Credential redaction** in error messages.
- **60 unit tests** covering format, faker, html, cache, security, and SQL injection resistance.
- **CI pipeline** on GitHub Actions (Node 22/24/26, smoke test, package check).
- **Release workflow** — tag `v*` triggers build, test, publish to npm with provenance, and GitHub release.

[0.1.0]: https://github.com/Enky-yy/fauxmcp/releases/tag/v0.1.0
[0.2.0]: https://github.com/Enky-yy/fauxmcp/releases/tag/v0.2.0
