# envpact-registry-publisher — documentation

> Programmatic submission of MCP servers to every public registry.
> One CLI, six adapters, runs on every npm publish.

## What it does

Replaces a manual checklist (open Smithery, click Add, paste URL,
repeat for 5 other registries) with a single command:

```bash
envpact-registry-publish ./server.json
```

The CLI walks each adapter, reports per-registry status, and exits
non-zero if any **required** adapter fails.

## Adapters

| Registry | How | Required? |
| :--- | :--- | :--- |
| Official MCP Registry | wraps `@modelcontextprotocol/publisher` CLI | yes |
| Smithery | wraps `@smithery/cli mcp publish` | no |
| glama.ai | passive (auto-indexes from official) | no |
| PulseMCP | passive (auto-indexes from official) | no |
| mcp.so | Playwright-driven Submit form | no |
| punkpeye/awesome-mcp-servers | gh CLI: fork + branch + patch + PR | no |

Failures of optional adapters surface in the CI log with a manual
fallback URL but don't fail the run.

## server.json

Each MCP server you want published has a `server.json` in its repo
root:

```json
{
  "name": "io.github.<you>/<package>",
  "description": "Short description shown in registry listings.",
  "version": "0.4.0",
  "homepage": "https://your-marketing-site",
  "repository": "https://github.com/<you>/<package>",
  "npm_package": "<package>",
  "license": "MIT",
  "categories": ["productivity", "developer-tools"],
  "install": {
    "command": "npx",
    "args": ["-y", "<package>"]
  }
}
```

Validation lives in `src/types.ts` (`validateServerSpec`); call
`envpact-registry-publish` with a malformed spec and it tells you
which field is wrong.

Hosted MCP servers can omit `npm_package` and `install` when they
provide at least one remote connection. See
`server.xquik.remote.example.json` for a streamable HTTP example with
OAuth 2.1 discovery. API-key fallback uses an `Authorization` bearer
header.

## GitHub Action

```yaml
- uses: chirag127/envpact-registry-publisher@v0
  with:
    server-json: ./server.json
  env:
    SMITHERY_API_KEY: ${{ secrets.SMITHERY_API_KEY }}
    MCP_PUBLISHER_TOKEN: ${{ secrets.MCP_PUBLISHER_TOKEN }}
    GH_PAT: ${{ secrets.GH_PAT_FOR_PR }}
```

Wire it after npm publish. Every release lands the server in every
registry on the same day.

## Authentication

| Registry | Variable | How to get it |
| :--- | :--- | :--- |
| Smithery | `SMITHERY_API_KEY` | smithery.ai → Settings → API Keys, OR `npx @smithery/cli auth login` once locally |
| Official MCP Registry | `MCP_PUBLISHER_TOKEN` | (Registry is in preview as of 2026-06; token process pending) |
| awesome-mcp-servers PR | `GH_PAT` (or `GITHUB_TOKEN` in Actions) | Fine-grained PAT with `repo` scope |
| mcp.so / Smithery Playwright fallback | uses cached browser session | Run once locally with `--headed` to seed credentials |

Tokens are read at run-time only. Never commit them.

## Failure model

Per the project's "fail loud" policy, a non-zero exit from any
**required** adapter fails the whole run. Optional adapter failures
surface in the log with a manual fallback URL but don't break CI.

## See also

- [Umbrella docs](https://chirag127.github.io/envpact/)
- [envpact-mcp](https://github.com/chirag127/envpact-mcp) — the server this tool publishes
