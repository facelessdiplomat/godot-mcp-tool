import { describe, expect, it } from 'vitest';
import type { EditorBridge, HelloResult } from '../../src/bridge/BridgeClient.js';
import type { BridgeEndpoint, DiscoveryResult, DiscoverySource } from '../../src/bridge/DiscoveryFileReader.js';
import { EditorConnection } from '../../src/bridge/EditorConnection.js';

const endpoint: BridgeEndpoint = {
  protocol: 1,
  port: 50731,
  token: 'secret',
  pid: 41234,
  godotVersion: '4.8.beta.custom_build.679066724',
  addonVersion: '0.1.0',
  projectPath: '/projects/game',
  executablePath: '/opt/godot/godot',
  lspPort: 6005,
  startedAt: '2026-10-21T18:00:00Z',
};

const hello: HelloResult = {
  protocol: 1,
  godotVersion: '4.8.beta.custom_build.679066724',
  addonVersion: '0.1.0',
  projectPath: '/projects/game',
  executablePath: '/opt/godot/godot',
  methods: ['hello', 'ping'],
};

class FakeDiscovery implements DiscoverySource {
  constructor(private readonly result: DiscoveryResult) {}

  read(): DiscoveryResult {
    return this.result;
  }
}

class FakeBridge implements EditorBridge {
  isOpen = false;
  connectCalls = 0;
  closeCalls = 0;

  constructor(private readonly outcome: HelloResult | Error) {}

  connect(): Promise<HelloResult> {
    this.connectCalls += 1;
    if (this.outcome instanceof Error) {
      return Promise.reject(this.outcome);
    }
    this.isOpen = true;
    return Promise.resolve(this.outcome);
  }

  request(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  onNotification(): void {}

  close(): void {
    this.closeCalls += 1;
    this.isOpen = false;
  }
}

function connectionWith(result: DiscoveryResult, bridges: FakeBridge[]): { connection: EditorConnection; endpoints: BridgeEndpoint[] } {
  const endpoints: BridgeEndpoint[] = [];
  const connection = new EditorConnection(new FakeDiscovery(result), (usedEndpoint) => {
    endpoints.push(usedEndpoint);
    const bridge = bridges.shift();
    if (bridge === undefined) {
      throw new Error('No more fake bridges');
    }
    return bridge;
  });
  return { connection, endpoints };
}

describe('EditorConnection', () => {
  it('explains that the editor is not running when there is no discovery file', async () => {
    const { connection } = connectionWith({ kind: 'missing', path: '/projects/game/.godot/godot_mcp_tool/bridge.json' }, []);

    const status = await connection.status();

    expect(status.connected).toBe(false);
    expect(!status.connected && status.reason).toContain('plugin');
  });

  it('explains a discovery file left behind by a stopped editor', async () => {
    const { connection } = connectionWith({ kind: 'stale', path: '/projects/game/.godot/godot_mcp_tool/bridge.json', pid: 41234 }, []);

    const status = await connection.status();

    expect(!status.connected && status.reason).toContain('41234');
  });

  it('explains an invalid discovery file', async () => {
    const { connection } = connectionWith({ kind: 'invalid', path: '/bridge.json', reason: 'port: expected number' }, []);

    const status = await connection.status();

    expect(!status.connected && status.reason).toContain('port: expected number');
  });

  it('connects to the endpoint from the discovery file', async () => {
    const bridge = new FakeBridge(hello);
    const { connection, endpoints } = connectionWith({ kind: 'found', endpoint }, [bridge]);

    await expect(connection.status()).resolves.toEqual({ connected: true, hello });
    expect(endpoints).toEqual([endpoint]);
  });

  it('reuses an open connection', async () => {
    const bridge = new FakeBridge(hello);
    const { connection } = connectionWith({ kind: 'found', endpoint }, [bridge]);

    await connection.status();
    await connection.status();

    expect(bridge.connectCalls).toBe(1);
  });

  it('reconnects after the connection was closed', async () => {
    const first = new FakeBridge(hello);
    const second = new FakeBridge(hello);
    const { connection } = connectionWith({ kind: 'found', endpoint }, [first, second]);

    await connection.status();
    first.isOpen = false;
    await connection.status();

    expect(second.connectCalls).toBe(1);
  });

  it('reports a failed connection with the port', async () => {
    const { connection } = connectionWith({ kind: 'found', endpoint }, [new FakeBridge(new Error('connect ECONNREFUSED'))]);

    const status = await connection.status();

    expect(!status.connected && status.reason).toContain('50731');
    expect(!status.connected && status.reason).toContain('ECONNREFUSED');
  });

  it('closes the open bridge', async () => {
    const bridge = new FakeBridge(hello);
    const { connection } = connectionWith({ kind: 'found', endpoint }, [bridge]);
    await connection.status();

    connection.close();

    expect(bridge.closeCalls).toBe(1);
  });
});
