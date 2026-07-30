// glama.ai adapter - passive auto-indexer; no submission needed.

import { Adapter, AdapterStatus, ServerSpec } from '../types.js';

export class GlamaAdapter implements Adapter {
  readonly name = 'glama';
  readonly required = false;

  /** Report the directory where official-registry propagation can be verified. */
  async submit(_spec: ServerSpec): Promise<AdapterStatus> {
    return {
      kind: 'no-op',
      reason: 'glama auto-indexes from the official registry; verify propagation in the server directory at https://glama.ai/mcp/servers',
    };
  }
}
