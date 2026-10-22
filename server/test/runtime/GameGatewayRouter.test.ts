import { describe, expect, it } from 'vitest';
import { BridgeRequestError } from '../../src/bridge/BridgeErrors.js';
import { EditorUnavailableError } from '../../src/editor/EditorGateway.js';
import { GameGatewayRouter, type LocalGame } from '../../src/runtime/GameGatewayRouter.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

class FakeLocalGame extends FakeEditorGateway implements LocalGame {
  isRunning = false;
}

const unavailable = new EditorUnavailableError('The Godot editor is not running for this project.');

describe('GameGatewayRouter', () => {
  it('runs the game in the editor when it is connected', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', { outcome: 'ready' });
    const local = new FakeLocalGame();

    await expect(new GameGatewayRouter(editor, local).request('game.run', {})).resolves.toEqual({ outcome: 'ready' });
    expect(local.requests).toEqual([]);
  });

  it('runs the game as a process when the editor is not available', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', unavailable);
    const local = new FakeLocalGame().respondTo('game.run', { outcome: 'ready' });

    await expect(new GameGatewayRouter(editor, local).request('game.run', { scene: 'main' })).resolves.toEqual({ outcome: 'ready' });
    expect(local.requests[0]?.params).toEqual({ scene: 'main' });
  });

  it('sends stop and output requests to where the game ran', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', unavailable);
    const local = new FakeLocalGame().respondTo('game.run', { outcome: 'ready' }).respondTo('game.get_output', { entries: [] }).respondTo('game.stop', { was_running: true });
    const router = new GameGatewayRouter(editor, local);

    await router.request('game.run', {});
    await router.request('game.get_output', { after: 3 });
    await router.request('game.stop', {});

    expect(local.requests.map((request) => request.method)).toEqual(['game.run', 'game.get_output', 'game.stop']);
    expect(editor.requests.map((request) => request.method)).toEqual(['game.run']);
  });

  it('asks the editor first when no game ran yet and falls back to the process', async () => {
    const editor = new FakeEditorGateway().respondTo('game.get_output', unavailable);
    const local = new FakeLocalGame().respondTo('game.get_output', { entries: [] });

    await expect(new GameGatewayRouter(editor, local).request('game.get_output', {})).resolves.toEqual({ entries: [] });
  });

  it('stops a game running as a process before running one in the editor', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', { outcome: 'ready' });
    const local = new FakeLocalGame().respondTo('game.stop', { was_running: true });
    local.isRunning = true;

    await new GameGatewayRouter(editor, local).request('game.run', {});

    expect(local.requests.map((request) => request.method)).toEqual(['game.stop']);
  });

  it('passes other editor errors on', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', new BridgeRequestError('The project has no main scene', -32602, undefined, undefined));

    await expect(new GameGatewayRouter(editor, new FakeLocalGame()).request('game.run', {})).rejects.toBeInstanceOf(BridgeRequestError);
  });
});
