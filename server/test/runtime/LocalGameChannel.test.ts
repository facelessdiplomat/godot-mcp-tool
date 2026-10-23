import { afterEach, describe, expect, it } from 'vitest';
import { BridgeRequestError } from '../../src/bridge/BridgeErrors.js';
import { LocalGameChannel } from '../../src/runtime/LocalGameChannel.js';
import { FakeGameClient } from '../support/FakeGameClient.js';

const token = 'c2VjcmV0LXRva2Vu';

describe('LocalGameChannel', () => {
  let channel: LocalGameChannel | undefined;
  const games: FakeGameClient[] = [];

  async function openChannel(): Promise<LocalGameChannel> {
    channel = await LocalGameChannel.open(token);
    return channel;
  }

  async function connectGame(port: number, presentedToken: string, answer: (request: { id: number; method: string; params: Record<string, unknown> }) => Record<string, unknown> | undefined): Promise<FakeGameClient> {
    const game = await FakeGameClient.connect(port, presentedToken, answer);
    games.push(game);
    return game;
  }

  afterEach(() => {
    for (const game of games.splice(0)) {
      game.quit();
    }
    channel?.close();
    channel = undefined;
  });

  it('sends requests to the game that presented the token and returns its answers', async () => {
    const opened = await openChannel();
    const game = await connectGame(opened.port, token, (request) => ({ id: request.id, result: { asked: request.method, params: request.params } }));

    const result = await opened.request('properties.get', { path: 'Player' }, 2000);

    expect(result).toEqual({ asked: 'properties.get', params: { path: 'Player' } });
    expect(game.requests).toEqual([{ id: 1, method: 'properties.get', params: { path: 'Player' } }]);
  });

  it('turns an error of the game into a request error with its code and hint', async () => {
    const opened = await openChannel();
    await connectGame(opened.port, token, (request) => ({ id: request.id, error: { code: -32004, message: 'No node at Enemy', hint: 'Read the tree with game_get_tree.' } }));

    const failure = await opened.request('properties.get', { path: 'Enemy' }, 2000).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BridgeRequestError);
    expect(failure).toMatchObject({ code: -32004, message: 'No node at Enemy', hint: 'Read the tree with game_get_tree.' });
  });

  it('closes a connection with the wrong token and keeps waiting for the game', async () => {
    const opened = await openChannel();
    const impostor = await connectGame(opened.port, 'wrong-token', (request) => ({ id: request.id, result: 'from the impostor' }));

    await expect.poll(() => impostor.isClosed).toBe(true);
    const pending = opened.request('tree', {}, 2000);
    await connectGame(opened.port, token, (request) => ({ id: request.id, result: 'from the game' }));

    await expect(pending).resolves.toBe('from the game');
  });

  it('fails the requests in flight when the game quits', async () => {
    const opened = await openChannel();
    const game = await connectGame(opened.port, token, () => undefined);
    const pending = opened.request('wait', { physics_frames: 600 }, 5000);
    await expect.poll(() => game.requests.length).toBe(1);

    game.quit();

    await expect(pending).rejects.toMatchObject({ code: -32006, message: 'The game stopped before it answered.' });
  });

  it('explains a game that never connected and a request that got no answer', async () => {
    const opened = await openChannel();
    const unconnected = await opened.request('tree', {}, 50).catch((error: unknown) => error);
    await connectGame(opened.port, token, () => undefined);
    const unanswered = await opened.request('tree', {}, 50).catch((error: unknown) => error);

    expect(unconnected).toMatchObject({ code: -32006, message: 'The game did not connect to the server.' });
    expect((unconnected as BridgeRequestError).hint).toContain('GodotMcpRuntime');
    expect(unanswered).toMatchObject({ code: -32008, message: 'The game did not answer within 50 ms' });
  });
});
