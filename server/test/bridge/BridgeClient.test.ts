import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { BridgeClient } from '../../src/bridge/BridgeClient.js';
import { BridgeRequestError } from '../../src/bridge/BridgeErrors.js';
import { editorRequiringToken, FakeAddonServer, type FakeRequestHandler } from '../support/FakeAddonServer.js';

const clientOptions = { clientName: 'godot-mcp-tool/0.1.0', protocol: 1, requestTimeoutMs: 2_000 };

describe('BridgeClient', () => {
  let addon: FakeAddonServer | undefined;
  let client: BridgeClient | undefined;

  afterEach(async () => {
    client?.close();
    await addon?.stop();
    client = undefined;
    addon = undefined;
  });

  async function connectTo(handler: FakeRequestHandler, token = 'secret'): Promise<BridgeClient> {
    addon = new FakeAddonServer(handler);
    const port = await addon.start();
    client = new BridgeClient({ port, token }, clientOptions);
    return client;
  }

  it('authenticates with the token and returns the editor information', async () => {
    const bridge = await connectTo(editorRequiringToken('secret'));

    const hello = await bridge.connect();

    expect(hello).toEqual({
      protocol: 1,
      godotVersion: '4.8.beta.custom_build.679066724',
      addonVersion: '0.1.0',
      projectPath: '/projects/game',
      executablePath: '/opt/godot/godot',
      methods: ['hello', 'ping'],
    });
    expect(addon?.receivedRequests[0]).toMatchObject({
      method: 'hello',
      params: { token: 'secret', protocol: 1, client: 'godot-mcp-tool/0.1.0' },
    });
    expect(bridge.isOpen).toBe(true);
  });

  it('rejects a wrong token', async () => {
    const bridge = await connectTo(editorRequiringToken('secret'), 'wrong');

    await expect(bridge.connect()).rejects.toThrow(/Invalid token/);
  });

  it('sends requests after the handshake and returns their results', async () => {
    const bridge = await connectTo(editorRequiringToken('secret'));
    await bridge.connect();

    await expect(bridge.request('ping')).resolves.toEqual({ pong: true });
  });

  it('turns editor errors into BridgeRequestError with the code and the hint', async () => {
    const bridge = await connectTo((request, connection) => {
      if (request.method === 'hello') {
        editorRequiringToken('secret')(request, connection);
        return;
      }
      connection.fail(request.id, -32004, 'Node not found', { hint: 'Similar: Player/MeshInstance3D' });
    });
    await bridge.connect();

    const error = await bridge.request('node.get').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BridgeRequestError);
    expect(error).toMatchObject({ code: -32004, message: 'Node not found', hint: 'Similar: Player/MeshInstance3D' });
  });

  it('fails a request that gets no answer in time', async () => {
    const bridge = await connectTo(editorRequiringToken('secret'));
    await bridge.connect();

    await expect(bridge.request('silent', {}, 50)).rejects.toThrow(/timed out/);
  });

  it('fails pending requests when the editor closes the connection', async () => {
    const bridge = await connectTo((request, connection) => {
      if (request.method === 'hello') {
        editorRequiringToken('secret')(request, connection);
        return;
      }
      connection.close();
    });
    await bridge.connect();

    await expect(bridge.request('drop')).rejects.toThrow(/closed/);
    expect(bridge.isOpen).toBe(false);
  });

  it('delivers notifications from the editor', async () => {
    const bridge = await connectTo((request, connection) => {
      editorRequiringToken('secret')(request, connection);
      if (request.method === 'hello') {
        connection.notify('log', { message: 'ready' });
      }
    });
    const notifications: { method: string; params: unknown }[] = [];
    bridge.onNotification((method, params) => {
      notifications.push({ method, params });
    });

    await bridge.connect();
    await expect.poll(() => notifications).toEqual([{ method: 'log', params: { message: 'ready' } }]);
  });

  it('fails to connect when nothing listens on the port', async () => {
    const closedPort = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        const port = address !== null && typeof address !== 'string' ? address.port : 0;
        probe.close(() => {
          resolve(port);
        });
      });
    });
    client = new BridgeClient({ port: closedPort, token: 'secret' }, clientOptions);

    await expect(client.connect()).rejects.toThrow(/ECONNREFUSED/);
  });
});
