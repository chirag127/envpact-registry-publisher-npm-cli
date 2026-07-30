// PulseMCP adapter - passive auto-indexer.

import { Adapter, AdapterStatus, ServerSpec } from '../types.js';

export class PulseMcpAdapter implements Adapter {
  readonly name = 'pulsemcp';
  readonly required = false;

  /** Report the directory where official-registry propagation can be verified. */
  async submit(_spec: ServerSpec): Promise<AdapterStatus> {
    return {
      kind: 'no-op',
      reason: 'PulseMCP ingests from the official registry. Verify propagation in the server directory at https://www.pulsemcp.com/servers',
    };
  }
}
