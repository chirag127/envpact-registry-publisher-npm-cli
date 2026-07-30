# envpact-registry-publisher

[![Live docs](https://img.shields.io/badge/docs-live-blue)](https://envpact-registry-publisher-npm-cli.oriz.in)
[![Stars](https://img.shields.io/github/stars/chirag127/envpact-registry-publisher-npm-cli?style=social)](https://github.com/chirag127/envpact-registry-publisher-npm-cli/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Programmatic submission of MCP servers to every public MCP registry -
on every npm publish, automatically.

**Live docs:** https://envpact-registry-publisher-npm-cli.oriz.in

Replaces the manual `MCP_REGISTRY_SUBMISSION.md` checklist with a
single CLI + GitHub Action that runs at the tail of `envpact-mcp`'s
publish workflow (or anyone else's).

## Why this exists

The MCP-registry ecosystem in 2026 is split across:

| Registry | Submission method |
| :--- | :--- |
| Official MCP Registry (`registry.modelcontextprotocol.io`) | `mcp-publisher` CLI + `server.json` |
| Smithery (`smithery.ai`) | API endpoint + bearer token (Playwright fallback if API rejects) |
| glama.ai | Passive - auto-indexes from the official registry |
| PulseMCP | Passive - same |
| mcp.so | Web form only (Playwright drives it) |
| `punkpeye/awesome-mcp-servers` | Pull request (driven by `gh` CLI) |

Doing six different things by hand on every release does not scale.

## Install

```bash
npm install -g envpact-registry-publisher
```

Or run as a GitHub Action:

```yaml
- uses: chirag127/envpact-registry-publisher@v0
  with:
    server-json: ./server.json
  env:
    SMITHERY_API_KEY: ${{ secrets.SMITHERY_API_KEY }}
    MCP_PUBLISHER_TOKEN: ${{ secrets.MCP_PUBLISHER_TOKEN }}
    GH_PAT: ${{ secrets.GH_PAT_FOR_PR }}
```

## Use

```bash
envpact-registry-publish ./server.json
```

The CLI walks every adapter in priority order, reports per-registry
status, and exits non-zero if any required adapter fails. It is safe
to re-run - every adapter is idempotent.

## What `server.json` looks like

```json
{
  "name": "io.github.chirag127/envpact-mcp",
  "description": "Centralised secrets manager for AI agents.",
  "version": "0.4.0",
  "homepage": "https://envpact.oriz.in",
  "repository": "https://github.com/chirag127/envpact-mcp",
  "npm_package": "envpact-mcp",
  "license": "MIT",
  "categories": ["productivity", "developer-tools"],
  "install": {
    "command": "npx",
    "args": ["-y", "envpact-mcp"]
  }
}
```

Hosted MCP servers can publish a remote connection instead of an npm
install command:

```json
{
  "name": "com.xquik/mcp",
  "description": "X data platform with REST endpoints, webhooks, monitoring, giveaway draws, and MCP tools.",
  "version": "2.6.0",
  "homepage": "https://xquik.com",
  "repository": "https://github.com/Xquik-dev/x-twitter-scraper",
  "license": "MIT",
  "categories": ["developer-tools", "automation"],
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://xquik.com/mcp"
    }
  ]
}
```

Xquik clients should prefer OAuth 2.1 discovery. API-key fallback uses `Authorization: Bearer <api-key>`.

Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.

## Architecture

`src/registries/` has one TypeScript adapter per registry; `runner.ts`
runs them in priority order; `cli.ts` is the entrypoint.

Adapters are best-effort. The official registry adapter is
`required: true` (failure exits non-zero). All others are
`required: false` (failure is logged with a manual-submission link
but doesn't break the run). Per the design choice "fail loud - any
required registry error fails the run".

## Authentication

| Adapter | Variable | Source |
| :--- | :--- | :--- |
| Smithery (REST) | `SMITHERY_API_KEY` | https://smithery.ai/dashboard → Settings |
| Smithery (Playwright fallback) | uses cached browser session | optional |
| Official Registry | `MCP_PUBLISHER_TOKEN` | (preview - pending) |
| `awesome-mcp-servers` PR | `GH_PAT` | GitHub PAT, repo scope |
| mcp.so Playwright | uses cached browser session | optional |

Tokens are read at run-time only; never committed.

## License

MIT.

## Documentation

- **[Repo docs (`docs/README.md`)](./docs/README.md)** - full reference for envpact-registry-publisher
- **[Project umbrella site](https://chirag127.github.io/envpact/)** - overview of all envpact components
