// punkpeye/awesome-mcp-servers adapter — fork + branch + PR via gh CLI.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  Adapter,
  AdapterStatus,
  RemoteHeaderSpec,
  ServerSpec,
} from '../types.js';
import { serverDisplayName } from '../types.js';

const execFileP = promisify(execFile);

const UPSTREAM = 'punkpeye/awesome-mcp-servers';
const SECTION_HEADING = '### Developer Tools';

/** Derive a safe placeholder while preserving a required bearer scheme. */
function formatSecretPlaceholder(header: RemoteHeaderSpec): string {
  const token = header.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const bearerPrefix =
    header.name.toLowerCase() === 'authorization' &&
    /^Bearer\s+/i.test(header.value ?? '')
      ? 'Bearer '
      : '';
  return `${bearerPrefix}<${token}_SECRET>`;
}

/** Render an install or hosted transport as an MCP client configuration. */
export function formatClientConfig(spec: ServerSpec): string {
  const displayName = serverDisplayName(spec);
  if (spec.install) {
    return JSON.stringify({
      mcpServers: {
        [displayName]: {
          command: spec.install.command,
          args: spec.install.args,
        },
      },
    }, null, 2);
  }
  const remote = spec.remotes?.[0];
  if (!remote) {
    throw new Error(
      'formatClientConfig: spec must define install or at least one remote'
    );
  }
  const headers = Object.fromEntries(
    (remote.headers ?? [])
      .map((header): [string, string] | null => {
        if (header.isSecret) {
          return [header.name, formatSecretPlaceholder(header)];
        }
        if (header.value === undefined) {
          return null;
        }
        return [header.name, header.value];
      })
      .filter((entry): entry is [string, string] => entry !== null)
  );
  const remoteConfig: Record<string, unknown> = {
    type: remote.type,
    url: remote.url,
  };
  if (Object.keys(headers).length > 0) {
    remoteConfig.headers = headers;
  }
  return JSON.stringify({
    mcpServers: {
      [displayName]: remoteConfig,
    },
  }, null, 2);
}

export class AwesomeMcpAdapter implements Adapter {
  readonly name = 'awesome-mcp-servers';
  readonly required = false;

  /** Add an unlisted server to awesome-mcp-servers through a fork pull request. */
  async submit(spec: ServerSpec): Promise<AdapterStatus> {
    if (!process.env.GH_PAT && !process.env.GITHUB_TOKEN) {
      return {
        kind: 'error',
        message: 'GH_PAT (or GITHUB_TOKEN) required to open a PR on awesome-mcp-servers',
        manualLink: `https://github.com/${UPSTREAM}/edit/main/README.md`,
      };
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envpact-amcp-'));
    try {
      // `gh repo fork <upstream> --clone` clones the fork into the
      // current directory. The --remote flag is a boolean (no
      // =false form) and is mutually exclusive with passing a repo
      // argument, so we just don't pass it.
      await this.gh(['repo', 'fork', UPSTREAM, '--clone'], tmpDir);
      const cloneDir = path.join(tmpDir, 'awesome-mcp-servers');
      const displayName = serverDisplayName(spec);
      const branch = `add-${displayName.replace(/[^a-z0-9-]/gi, '-')}-${spec.version}`;

      await this.git(['fetch', 'origin', 'main'], cloneDir);
      await this.git(['checkout', '-B', branch, 'origin/main'], cloneDir);

      const readmePath = path.join(cloneDir, 'README.md');
      const readme = fs.readFileSync(readmePath, 'utf8');
      const entry = this.formatEntry(spec);
      if (readme.includes(`[${displayName}]`)) {
        return { kind: 'no-op', reason: 'server already listed in README — no PR needed' };
      }
      const patched = this.insertUnderHeading(readme, SECTION_HEADING, entry);
      fs.writeFileSync(readmePath, patched, 'utf8');

      await this.git(['add', 'README.md'], cloneDir);
      await this.git(['commit', '-s', '-m', `add ${displayName} (v${spec.version})`], cloneDir);
      await this.git(['push', '-u', 'origin', branch], cloneDir);

      const prTitle = `Add ${displayName} - ${spec.description.slice(0, 60)}`;
      const prBody = this.formatPrBody(spec);
      const fork = await this.detectFork();
      const { stdout } = await this.gh([
        'pr', 'create', '--repo', UPSTREAM,
        '--title', prTitle,
        '--body', prBody,
        '--head', `${fork}:${branch}`,
        '--base', 'main',
      ], cloneDir);
      return { kind: 'submitted', url: stdout.trim(), detail: 'PR opened' };
    } catch (e: any) {
      const stderr = (e.stderr ?? '').toString();
      if (stderr.includes('already exists')) {
        return { kind: 'no-op', reason: 'PR for this branch is already open upstream' };
      }
      return {
        kind: 'error',
        message: `awesome-mcp-servers PR failed: ${stderr || e.message}`,
        manualLink: `https://github.com/${UPSTREAM}/pulls`,
      };
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  /** Format the server as an awesome-list Markdown entry. */
  private formatEntry(spec: ServerSpec): string {
    return `- [${serverDisplayName(spec)}](${spec.repository}) - ${spec.description}`;
  }

  /** Build the pull request description with a safe client configuration. */
  private formatPrBody(spec: ServerSpec): string {
    const displayName = serverDisplayName(spec);
    const configSnippet = formatClientConfig(spec);
    return `## What

Adds [\`${displayName}\`](${spec.repository}) to the list.

## Description

${spec.description}

## Client config

\`\`\`jsonc
${configSnippet}
\`\`\`

## License

${spec.license}.

(Submitted by [envpact-registry-publisher](https://github.com/chirag127/envpact-registry-publisher).)
`;
  }

  /** Insert a list entry beneath its category heading. */
  private insertUnderHeading(text: string, heading: string, entry: string): string {
    const lines = text.split('\n');
    const headingIdx = lines.findIndex((l) => l.trim() === heading);
    if (headingIdx < 0) {
      return `${text.trimEnd()}\n\n${heading}\n\n${entry}\n`;
    }
    let i = headingIdx + 1;
    while (i < lines.length && (lines[i].startsWith('- ') || lines[i].trim() === '')) i++;
    lines.splice(i, 0, entry);
    return lines.join('\n');
  }

  /** Return the authenticated GitHub account that owns the fork. */
  private async detectFork(): Promise<string> {
    const { stdout } = await this.gh(['api', 'user', '--jq', '.login'], process.cwd());
    return stdout.trim();
  }

  /** Run GitHub CLI with the configured automation credential. */
  private gh(args: string[], cwd: string) {
    return execFileP('gh', args, {
      cwd,
      env: {
        ...process.env,
        GH_TOKEN: process.env.GH_PAT || process.env.GITHUB_TOKEN || '',
      },
      timeout: 60_000,
    });
  }

  /** Run a bounded Git command in the temporary clone. */
  private git(args: string[], cwd: string) {
    return execFileP('git', args, { cwd, timeout: 60_000 });
  }
}
