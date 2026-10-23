import { describe, expect, it } from 'vitest';
import type { EditorBridge, HelloResult, NotificationListener } from '../../src/bridge/BridgeClient.js';
import type { BridgeEndpoint, DiscoveryResult, DiscoverySource } from '../../src/bridge/DiscoveryFileReader.js';
import { EditorConnection, UnavailableEditor } from '../../src/bridge/EditorConnection.js';
import { EditorUnavailableError } from '../../src/editor/EditorGateway.js';

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
  dapPort: 6006,
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
  readonly requests: { method: string; params: Record<string, unknown> | undefined; timeoutMs: number | undefined }[] = [];
  requestResult: unknown = { ok: true };

  constructor(private readonly outcome: HelloResult | Error) {}

  connect(): Promise<HelloResult> {
    this.connectCalls += 1;
    if (this.outcome instanceof Error) {
      return Promise.reject(this.outcome);
    }
    this.isOpen = true;
    return Promise.resolve(this.outcome);
  }

  request(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    this.requests.push({ method, params, timeoutMs });
    return Promise.resolve(this.requestResult);
  }

  notificationListeners: NotificationListener[] = [];

  onNotification(listener: NotificationListener): void {
    this.notificationListeners.push(listener);
  }

  notify(method: string, params: unknown): void {
    for (const listener of this.notificationListeners) {
      listener(method, params);
    }
  }

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
    const { connection } = connectionWith({ kind: 'stale', path: '/projects/game/.godot/godot_mcp_tool/bridge.json', pid: 41234, executablePath: '/opt/godot/godot' }, []);

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

  it('connects on the first request and sends it over the bridge', async () => {
    const bridge = new FakeBridge(hello);
    bridge.requestResult = { scene: 'res://main.tscn' };
    const { connection } = connectionWith({ kind: 'found', endpoint }, [bridge]);

    const response = await connection.request('scene.get_tree', { max_depth: 2 }, { timeoutMs: 5000 });

    expect(response).toEqual({ scene: 'res://main.tscn' });
    expect(bridge.connectCalls).toBe(1);
    expect(bridge.requests).toEqual([{ method: 'scene.get_tree', params: { max_depth: 2 }, timeoutMs: 5000 }]);
  });

  it('refuses a request with the reason when the editor is not reachable', async () => {
    const { connection } = connectionWith({ kind: 'missing', path: '/projects/game/.godot/godot_mcp_tool/bridge.json' }, []);

    const request = connection.request('ping', {});

    await expect(request).rejects.toBeInstanceOf(EditorUnavailableError);
    await expect(request).rejects.toThrow('plugin');
  });
});

describe('EditorConnection language server', () => {
  it('gives the port from the discovery file and the project path of the editor', async () => {
    const { connection } = connectionWith({ kind: 'found', endpoint }, [new FakeBridge(hello)]);

    await expect(connection.languageServer()).resolves.toEqual({ port: 6005, projectPath: '/projects/game' });
  });

  it('gives nothing while the editor is not connected', async () => {
    const { connection } = connectionWith({ kind: 'missing', path: '/projects/game/.godot/godot_mcp_tool/bridge.json' }, []);

    await expect(connection.languageServer()).resolves.toBeUndefined();
  });
});

describe('EditorConnection debug adapter', () => {
  it('gives the port from the discovery file and the project path of the editor', async () => {
    const { connection } = connectionWith({ kind: 'found', endpoint: { ...endpoint, dapPort: 6016 } }, [new FakeBridge(hello)]);

    await expect(connection.debugAdapter()).resolves.toEqual({ port: 6016, projectPath: '/projects/game' });
  });

  it('gives nothing while the editor is not connected', async () => {
    const { connection } = connectionWith({ kind: 'missing', path: '/projects/game/.godot/godot_mcp_tool/bridge.json' }, []);

    await expect(connection.debugAdapter()).resolves.toBeUndefined();
    await expect(new UnavailableEditor('No Godot project was found.').debugAdapter()).resolves.toBeUndefined();
  });
});

describe('EditorConnection notifications', () => {
  it('passes notifications on with the number of the connection', async () => {
    const first = new FakeBridge(hello);
    const second = new FakeBridge(hello);
    const { connection } = connectionWith({ kind: 'found', endpoint }, [first, second]);
    const received: [number, string, unknown][] = [];
    connection.onNotification((connectionNumber, method, params) => {
      received.push([connectionNumber, method, params]);
    });

    await connection.status();
    first.notify('log.status', { errors: 1 });
    first.isOpen = false;
    await connection.status();
    second.notify('log.status', { errors: 0 });

    expect(received).toEqual([
      [1, 'log.status', { errors: 1 }],
      [2, 'log.status', { errors: 0 }],
    ]);
  });
});

describe('UnavailableEditor', () => {
  it('refuses every request with its reason', async () => {
    const editor = new UnavailableEditor('No Godot project was found.');

    await expect(editor.request('ping', {})).rejects.toThrow(new EditorUnavailableError('No Godot project was found.'));
  });
});
