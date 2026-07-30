// Unit tests - pure validation + manifest-shape logic only.

import { test } from 'node:test';
import assert from 'node:assert';
import { formatClientConfig } from '../src/registries/awesome.js';
import { GlamaAdapter } from '../src/registries/glama.js';
import { PulseMcpAdapter } from '../src/registries/pulsemcp.js';
import { serverDisplayName, validateServerSpec } from '../src/types.js';
import type { RunResult } from '../src/runner.js';
import { shouldExitNonZero } from '../src/runner.js';

test('validateServerSpec: accepts a complete spec', () => {
  const spec = validateServerSpec({
    name: 'io.github.chirag127/envpact-mcp',
    description: 'd',
    version: '0.4.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/chirag127/envpact-mcp',
    npm_package: 'envpact-mcp',
    license: 'MIT',
    categories: ['productivity'],
    install: { command: 'npx', args: ['-y', 'envpact-mcp'] },
  });
  assert.strictEqual(spec.name, 'io.github.chirag127/envpact-mcp');
});

test('validateServerSpec: accepts a hosted remote-only spec', () => {
  const spec = validateServerSpec({
    name: 'com.xquik/mcp',
    description: 'X data platform with REST endpoints, webhooks, monitoring, giveaway draws, and MCP tools.',
    version: '2.6.0',
    homepage: 'https://xquik.com',
    repository: 'https://github.com/Xquik-dev/x-twitter-scraper',
    license: 'MIT',
    categories: ['developer-tools', 'automation'],
    remotes: [
      {
        type: 'streamable-http',
        url: 'https://xquik.com/mcp',
      },
    ],
  });
  assert.strictEqual(spec.name, 'com.xquik/mcp');
  assert.strictEqual(spec.remotes?.[0]?.url, 'https://xquik.com/mcp');
  assert.strictEqual(spec.install, undefined);
  assert.deepStrictEqual(JSON.parse(formatClientConfig(spec)), {
    mcpServers: {
      'com.xquik/mcp': {
        type: 'streamable-http',
        url: 'https://xquik.com/mcp',
      },
    },
  });
});

test('formatClientConfig: preserves bearer schemes without exposing secret templates', () => {
  const spec = validateServerSpec({
    name: 'com.example/remote',
    description: 'Example hosted MCP server.',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/remote',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [
      {
        type: 'streamable-http',
        url: 'https://example.com/mcp',
        headers: [
          {
            name: 'Authorization',
            value: 'Bearer {EXAMPLE_API_KEY}',
            isSecret: true,
          },
          { name: 'X-Optional' },
          { name: 'X-Client', value: 'example-cli', isSecret: false },
        ],
      },
    ],
  });
  const config = formatClientConfig(spec);
  assert.deepStrictEqual(JSON.parse(config), {
    mcpServers: {
      'com.example/remote': {
        type: 'streamable-http',
        url: 'https://example.com/mcp',
        headers: {
          Authorization: 'Bearer <AUTHORIZATION_SECRET>',
          'X-Client': 'example-cli',
        },
      },
    },
  });
  assert.doesNotMatch(config, /EXAMPLE_API_KEY/);
  assert.throws(
    () =>
      formatClientConfig({
        name: 'com.example/missing-transport',
        description: 'Invalid direct formatter input.',
        version: '1.0.0',
        homepage: 'https://example.com',
        repository: 'https://github.com/example/missing-transport',
        license: 'MIT',
        categories: ['developer-tools'],
      }),
    /must define install or at least one remote/
  );
});

test('validateServerSpec: accepts an SSE remote and varied headers', () => {
  const spec = validateServerSpec({
    name: 'com.example/sse-mcp',
    description: 'Example MCP server using SSE remotes.',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/sse-mcp',
    license: 'Apache-2.0',
    categories: ['developer-tools'],
    remotes: [
      {
        type: 'sse',
        url: 'https://example.com/mcp/events',
        headers: [
          { name: 'Authorization', value: 'Bearer {EXAMPLE_API_KEY}', isSecret: true },
          { name: 'X-Feature-Flag' },
          { name: 'X-Client', value: 'example-cli', isSecret: false },
        ],
      },
    ],
  });
  assert.strictEqual(spec.remotes?.[0]?.type, 'sse');
  assert.strictEqual(spec.remotes?.[0]?.headers?.length, 3);
  assert.strictEqual(spec.install, undefined);
});

test('validateServerSpec: rejects missing required fields', () => {
  assert.throws(() => validateServerSpec({}), /name/);
  assert.throws(() => validateServerSpec({ name: 'foo', description: 'x' }), /version/);
});

test('validateServerSpec: rejects specs without install or remotes', () => {
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
  }), /install.*remote/);
});

test('validateServerSpec: rejects malformed install entries', () => {
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    npm_package: '@example/server',
  }), /npm_package.*install/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    npm_package: '@example/server',
    install: { args: ['-y', '@example/server'] },
  }), /install\.command/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    npm_package: '@example/server',
    install: { command: 'npx', args: '-y @example/server' },
  }), /install\.args/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    npm_package: '@example/server',
    install: { command: 'npx', args: ['-y', 123] },
  }), /install\.args must be an array of strings/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    npm_package: '@example/server',
    install: { command: '   ', args: [] },
  }), /install\.command/);
});

test('validateServerSpec: rejects malformed remote entries', () => {
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [],
  }), /remotes must be a non-empty array/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: { url: 'https://example.com/mcp' },
  }), /remotes must be an array/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    npm_package: '@example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    install: { command: 'npx', args: ['-y', '@example/server'] },
    remotes: undefined,
  }), /remotes must be an array/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    npm_package: '@example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    install: { command: 'npx', args: ['-y', '@example/server'] },
    remotes: 'not-an-array',
  }), /remotes must be an array/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [null],
  }), /remotes\[0\] must be an object/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [{ type: 'websocket', url: 'https://example.com/mcp' }],
  }), /remotes\[0\]\.type/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [{ type: 'streamable-http' }],
  }), /remotes\[0\]\.url/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [{ type: 'streamable-http', url: 'not-a-url' }],
  }), /remotes\[0\]\.url must be an HTTP\(S\) URL/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [{ type: 'sse', url: 'ftp://example.com/events' }],
  }), /remotes\[0\]\.url must be an HTTP\(S\) URL/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp', headers: 'not-array' }],
  }), /remotes\[0\]\.headers/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp', headers: ['bad'] }],
  }), /remotes\[0\]\.headers\[0\]/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp', headers: [{ value: 'x' }] }],
  }), /remotes\[0\]\.headers\[0\]\.name/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp', headers: [{ name: 'Authorization', value: 123 }] }],
  }), /remotes\[0\]\.headers\[0\]\.value/);
  assert.throws(() => validateServerSpec({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [
      {
        type: 'streamable-http',
        url: 'https://example.com/mcp',
        headers: [{ name: 'Authorization', isSecret: 'yes' }],
      },
    ],
  }), /remotes\[0\]\.headers\[0\]\.isSecret/);
});

test('validateServerSpec: validates reverse-DNS label boundaries', () => {
  const hyphenated = validateServerSpec({
    name: 'x-quik.example/mcp',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/mcp',
    npm_package: 'example-mcp',
    license: 'MIT',
    categories: [],
    install: { command: 'npx', args: ['-y', 'example-mcp'] },
  });
  assert.strictEqual(hyphenated.name, 'x-quik.example/mcp');
  assert.throws(() => validateServerSpec({
    name: 'not-the-canonical-form',
    description: 'd', version: '0.0.1', homepage: 'h', repository: 'r',
    npm_package: 'p', license: 'MIT', categories: [], install: { command: 'a', args: [] },
  }), /reverse-DNS/);
  assert.throws(() => validateServerSpec({
    name: 'foo/bar',
    description: 'd', version: '0.0.1', homepage: 'h', repository: 'r',
    npm_package: 'p', license: 'MIT', categories: [], install: { command: 'a', args: [] },
  }), /reverse-DNS/);
  for (const name of [
    '-xquik.example/mcp',
    'xquik-.example/mcp',
    'com.-xquik/mcp',
    'com.xquik-/mcp',
  ]) {
    assert.throws(() => validateServerSpec({
      name,
      description: 'd', version: '0.0.1', homepage: 'h', repository: 'r',
      npm_package: 'p', license: 'MIT', categories: [], install: { command: 'a', args: [] },
    }), /reverse-DNS/);
  }
});

test('serverDisplayName: prefers package name and falls back to server name', () => {
  assert.strictEqual(serverDisplayName({
    name: 'com.example/remote',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/remote',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp' }],
  }), 'com.example/remote');
  assert.strictEqual(serverDisplayName({
    name: 'io.github.example/server',
    description: 'd',
    version: '1.0.0',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/server',
    npm_package: '@example/server',
    license: 'MIT',
    categories: ['developer-tools'],
    install: { command: 'npx', args: ['-y', '@example/server'] },
  }), '@example/server');
});

test('passive adapters return truthful registry discovery URLs', async () => {
  const spec = validateServerSpec({
    name: 'com.xquik/mcp',
    description: 'Hosted MCP server.',
    version: '2.6.0',
    homepage: 'https://xquik.com',
    repository: 'https://github.com/Xquik-dev/x-twitter-scraper',
    license: 'MIT',
    categories: ['developer-tools'],
    remotes: [{ type: 'streamable-http', url: 'https://xquik.com/mcp' }],
  });
  const glama = await new GlamaAdapter().submit(spec);
  const pulse = await new PulseMcpAdapter().submit(spec);
  assert.deepStrictEqual(glama, {
    kind: 'no-op',
    reason: 'glama auto-indexes from the official registry; verify propagation in the server directory at https://glama.ai/mcp/servers',
  });
  assert.deepStrictEqual(pulse, {
    kind: 'no-op',
    reason: 'PulseMCP ingests from the official registry. Verify propagation in the server directory at https://www.pulsemcp.com/servers',
  });
});

test('shouldExitNonZero: false when all results are submitted/no-op', () => {
  const results: RunResult[] = [
    { adapter: 'official-mcp-registry', status: { kind: 'submitted' }, durationMs: 10 },
    { adapter: 'smithery', status: { kind: 'no-op', reason: 'x' }, durationMs: 10 },
  ];
  assert.strictEqual(shouldExitNonZero(results), false);
});

test('shouldExitNonZero: true if a REQUIRED adapter errored', () => {
  const results: RunResult[] = [
    { adapter: 'official-mcp-registry', status: { kind: 'error', message: 'down' }, durationMs: 10 },
    { adapter: 'smithery', status: { kind: 'submitted' }, durationMs: 10 },
  ];
  assert.strictEqual(shouldExitNonZero(results), true);
});

test('shouldExitNonZero: false if only OPTIONAL adapters errored', () => {
  const results: RunResult[] = [
    { adapter: 'official-mcp-registry', status: { kind: 'submitted' }, durationMs: 10 },
    { adapter: 'smithery', status: { kind: 'error', message: 'rate limited' }, durationMs: 10 },
    { adapter: 'mcp.so', status: { kind: 'error', message: 'form changed' }, durationMs: 10 },
  ];
  assert.strictEqual(shouldExitNonZero(results), false);
});
