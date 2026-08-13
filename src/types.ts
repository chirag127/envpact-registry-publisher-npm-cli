// envpact-registry-publisher - adapter interface and shared types.
//
// Every registry has its own quirks (REST endpoint, web form, PR
// flow, completely passive). The Adapter interface normalises them
// to a single submit() method so runner.ts can iterate without
// caring what each one is doing under the hood.

export interface InstallSpec {
  command: string;
  args: string[];
}

export interface RemoteHeaderSpec {
  name: string;
  value?: string;
  isSecret?: boolean;
}

export interface RemoteSpec {
  type: 'streamable-http' | 'sse';
  url: string;
  headers?: RemoteHeaderSpec[];
}

/** Parsed contents of server.json - the canonical descriptor. */
export interface ServerSpec {
  /** Reverse-DNS MCP id format, for example "io.github.<user>/<package>" */
  name: string;
  /** Short description shown in registry listings */
  description: string;
  /** Semver version of the server being announced */
  version: string;
  /** Marketing/landing URL */
  homepage: string;
  /** Public source repository */
  repository: string;
  /** npm package name (often differs from id) - used for install command */
  npm_package?: string;
  /** SPDX license identifier */
  license: string;
  /** Free-form tags used by mcp.so / awesome-mcp categorisation */
  categories: string[];
  /** Install command shown in MCP-client config snippets */
  install?: InstallSpec;
  /** Hosted MCP remotes for servers that are connected to instead of installed */
  remotes?: RemoteSpec[];
}

/** Outcome of a single adapter run. */
export type AdapterStatus =
  | { kind: 'submitted'; url?: string; detail?: string }
  | { kind: 'no-op'; reason: string }
  | { kind: 'error'; message: string; manualLink?: string };

export interface Adapter {
  /** Display name shown in CI logs */
  readonly name: string;
  /** Hard-fail vs soft-fail when submit() throws. Hard-fail propagates non-zero exit. */
  readonly required: boolean;
  /** Run the submission. Throws on hard error; returns AdapterStatus otherwise. */
  submit(spec: ServerSpec): Promise<AdapterStatus>;
}

/** Return the package name when installed locally, or the canonical server id. */
export function serverDisplayName(spec: ServerSpec): string {
  return spec.npm_package ?? spec.name;
}

const DNS_LABEL_PATTERN = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?';
const SERVER_NAME_PATTERN = new RegExp(
  `^${DNS_LABEL_PATTERN}(?:\\.${DNS_LABEL_PATTERN})+\\/[A-Za-z0-9._-]+$`
);

/** Check that an object field contains a non-empty string. */
function hasStringField(o: Record<string, unknown>, key: string): boolean {
  return typeof o[key] === 'string' && (o[key] as string).trim().length > 0;
}

/** Validate the package and command fields for an installable server. */
function validateInstall(o: Record<string, unknown>): void {
  const inst = o.install;
  if (!hasStringField(o, 'npm_package') || typeof inst !== 'object' || inst === null) {
    throw new Error('server.json: npm_package and install are required for package-based servers');
  }
  const install = inst as Record<string, unknown>;
  if (!hasStringField(install, 'command') || !Array.isArray(install.args)) {
    throw new Error('server.json: install.command (non-empty string) and install.args (array) are required');
  }
  if (!install.args.every((arg) => typeof arg === 'string')) {
    throw new Error('server.json: install.args must be an array of strings');
  }
}

/** Return whether a value is an absolute HTTP or HTTPS URL. */
function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Validate each hosted transport, endpoint, and optional request header. */
function validateRemotes(remotes: unknown): void {
  if (!Array.isArray(remotes)) {
    throw new Error('server.json: remotes must be an array when provided');
  }
  if (remotes.length === 0) {
    throw new Error('server.json: remotes must be a non-empty array when provided');
  }
  remotes.forEach((remote, i) => {
    if (typeof remote !== 'object' || remote === null) {
      throw new Error(`server.json: remotes[${i}] must be an object`);
    }
    const r = remote as Record<string, unknown>;
    if (r.type !== 'streamable-http' && r.type !== 'sse') {
      throw new Error(`server.json: remotes[${i}].type must be "streamable-http" or "sse"`);
    }
    const remoteUrl = r.url;
    if (typeof remoteUrl !== 'string' || remoteUrl.trim().length === 0) {
      throw new Error(`server.json: remotes[${i}].url must be a string`);
    }
    if (!isHttpUrl(remoteUrl)) {
      throw new Error(`server.json: remotes[${i}].url must be an HTTP(S) URL`);
    }
    if (r.headers !== undefined) {
      if (!Array.isArray(r.headers)) {
        throw new Error(`server.json: remotes[${i}].headers must be an array`);
      }
      r.headers.forEach((header, h) => {
        if (typeof header !== 'object' || header === null) {
          throw new Error(`server.json: remotes[${i}].headers[${h}] must be an object`);
        }
        const candidate = header as Record<string, unknown>;
        if (!hasStringField(candidate, 'name')) {
          throw new Error(`server.json: remotes[${i}].headers[${h}].name must be a string`);
        }
        if (candidate.value !== undefined && typeof candidate.value !== 'string') {
          throw new Error(`server.json: remotes[${i}].headers[${h}].value must be a string`);
        }
        if (candidate.isSecret !== undefined && typeof candidate.isSecret !== 'boolean') {
          throw new Error(`server.json: remotes[${i}].headers[${h}].isSecret must be a boolean`);
        }
      });
    }
  });
}

/** Validate a parsed JSON object shape - narrow defensively. */
export function validateServerSpec(v: unknown): ServerSpec {
  if (typeof v !== 'object' || v === null) {
    throw new Error('server.json must be an object');
  }
  const o = v as Record<string, unknown>;
  const req = (k: string, t: 'string' | 'object' | 'array') => {
    const got = o[k];
    if (t === 'array' ? !Array.isArray(got) : typeof got !== t) {
      throw new Error(`server.json: required field "${k}" must be a ${t}`);
    }
  };
  req('name', 'string'); req('description', 'string');
  req('version', 'string'); req('homepage', 'string');
  req('repository', 'string');
  req('license', 'string'); req('categories', 'array');
  if (!(o.categories as unknown[]).every((category) => typeof category === 'string')) {
    throw new Error('server.json: categories must be an array of strings');
  }
  const hasInstall = o.npm_package !== undefined || o.install !== undefined;
  const hasRemoteField = Object.hasOwn(o, 'remotes');
  if (hasInstall) {
    validateInstall(o);
  }
  if (hasRemoteField) {
    validateRemotes(o.remotes);
  }
  if (!hasInstall && !hasRemoteField) {
    throw new Error('server.json: either npm_package plus install, or at least one remote, is required');
  }
  // Nail down the canonical id shape so we don't ship bogus names to
  // registries that pattern-match on it.
  if (!SERVER_NAME_PATTERN.test(o.name as string)) {
    throw new Error('server.json: name must match reverse-DNS form such as "io.github.<user>/<package>"');
  }
  return v as ServerSpec;
}
