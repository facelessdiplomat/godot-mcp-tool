import { createServer } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DebugAdapterClient, type DebugAdapterEvent, DebugAdapterRequestError, DebugAdapterUnavailableError } from '../../src/debug/DebugAdapterClient.js';
import { FakeDebugAdapter } from '../support/FakeDebugAdapter.js';

const wrongPathError = {
  success: false,
  message: 'wrong_path',
  body: {
    error: {
      id: 0,
      format: 'The editor and client are working on different paths; the client is on "{clientPath}", but the editor is on "{editorPath}"',
      variables: { clientPath: '/games/arena/project.godot', editorPath: '/games/racer' },
    },
  },
};

describe('DebugAdapterClient', () => {
  let adapter: FakeDebugAdapter;
  let port: number;
  let client: DebugAdapterClient | undefined;

  beforeEach(async () => {
    adapter = new FakeDebugAdapter();
    port = await adapter.listen();
  });

  afterEach(async () => {
    client?.close();
    client = undefined;
    await adapter.close();
  });

  async function connect(): Promise<DebugAdapterClient> {
    client = await DebugAdapterClient.connect(port);
    return client;
  }

  it('sends numbered requests and answers each with the body of its response', async () => {
    adapter.answer = (request) => ({ success: true, body: { echoed: request.command } });
    const debugAdapter = await connect();

    const [threads, stack] = await Promise.all([debugAdapter.request('threads'), debugAdapter.request('stackTrace', { threadId: 1 })]);

    expect(adapter.received).toEqual([
      { seq: 1, type: 'request', command: 'threads', arguments: {} },
      { seq: 2, type: 'request', command: 'stackTrace', arguments: { threadId: 1 } },
    ]);
    expect(threads).toEqual({ echoed: 'threads' });
    expect(stack).toEqual({ echoed: 'stackTrace' });
  });

  it('rejects a failed request with the message of the adapter, its variables filled in', async () => {
    adapter.answer = () => wrongPathError;
    const debugAdapter = await connect();

    const failure = await debugAdapter.request('setBreakpoints').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DebugAdapterRequestError);
    expect((failure as DebugAdapterRequestError).code).toBe('wrong_path');
    expect((failure as DebugAdapterRequestError).variables).toEqual({ clientPath: '/games/arena/project.godot', editorPath: '/games/racer' });
    expect((failure as DebugAdapterRequestError).message).toBe(
      'The editor and client are working on different paths; the client is on "/games/arena/project.godot", but the editor is on "/games/racer"',
    );
  });

  it('passes the events of the adapter to its listeners', async () => {
    const debugAdapter = await connect();
    const events: DebugAdapterEvent[] = [];
    debugAdapter.onEvent((event) => events.push(event));
    await expect.poll(() => adapter.connectedClients).toBe(1);

    adapter.emit('stopped', { reason: 'breakpoint', threadId: 1 });

    await expect.poll(() => events).toEqual([{ event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } }]);
  });

  it('fails the requests in flight when the adapter closes the connection', async () => {
    adapter.answer = () => undefined;
    const debugAdapter = await connect();
    const pending = debugAdapter.request('variables', { variablesReference: 1 });
    await expect.poll(() => adapter.received.length).toBe(1);

    adapter.disconnectClients();

    await expect(pending).rejects.toThrow('The debug adapter closed the connection.');
    expect(debugAdapter.isOpen).toBe(false);
  });

  it('gives up on a request that gets no answer in time', async () => {
    adapter.answer = () => undefined;
    const debugAdapter = await connect();

    await expect(debugAdapter.request('evaluate', { expression: 'speed' }, 50)).rejects.toThrow('The debug adapter did not answer "evaluate" within 50 ms.');
  });

  it('reports a port where nothing listens', async () => {
    const unusedPort = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        probe.close(() => {
          resolve(typeof address === 'object' && address !== null ? address.port : 0);
        });
      });
    });

    await expect(DebugAdapterClient.connect(unusedPort)).rejects.toBeInstanceOf(DebugAdapterUnavailableError);
  });
});
