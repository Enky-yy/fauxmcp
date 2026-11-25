# Security Policy

## Supported versions

`fauxmcp` is pre-1.0. Security fixes land on the latest published version; please upgrade before
reporting an issue that may already be fixed.

| Version | Supported |
| --- | --- |
| 0.1.x | ✅ |
| < 0.1 | ❌ |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private vulnerability reporting:
[Security → Report a vulnerability](https://github.com/Enky-yy/fauxmcp/security/advisories/new).

Include:

- the version (`npx fauxmcp --version` or the `package.json` version),
- a minimal reproduction (tool call, URL, or environment variables),
- the impact you observed and any suggested fix.

You can expect an initial response within 7 days. Please allow time for a fix and release before
any public disclosure.

## Scope

`fauxmcp` runs locally over stdio and has no listening network port. In-scope concerns include:

- SSRF or redirect bypasses around the metadata/link-local blocklist,
- arbitrary file read/write through the dataset cache,
- CSV/spreadsheet formula injection in exported data,
- context-flooding or denial-of-service through tool inputs,
- prompt-injection amplification through fetched content,
- secrets leaking into logs, errors, or the published package.

Out of scope: the trustworthiness of third-party URLs you ask the server to fetch, JavaScript-
rendered pages that cannot be scraped, and the realism of generated (synthetic) data.

## Built-in protections

- http(s)-only fetches, with every redirect hop re-validated,
- cloud metadata and link-local hosts blocked by default (`FAUX_ALLOW_METADATA=1` to opt out),
- streaming download size cap, request timeout, and redirect limit,
- row / field / column / cell / preview caps for every response,
- formula neutralization for scraped CSV exports,
- cache directory containment plus `0700` directory and `0600` file permissions,
- credentials stripped from URLs in error messages.
