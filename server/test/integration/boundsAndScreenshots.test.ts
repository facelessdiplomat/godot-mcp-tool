import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeCaptureScene } from './captureScene.js';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

describe.skipIf(godotBinary === '')('bounds and screenshots without a window', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP bounds', { mainScene: 'res://main.tscn' });
    writeCaptureScene(project);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('measures a mesh of a scene read from disk', async () => {
    const bounds = await tools().call('node_get_bounds', { path: 'Crate', scene: 'res://main.tscn' });

    expect(bounds.text).toBe(
      [
        'Crate (MeshInstance3D) in res://main.tscn, in world coordinates:',
        'center Vector3(4, 1, 0), size Vector3(2, 2, 2)',
        'from Vector3(3, 0, -1) to Vector3(5, 2, 1)',
        'Measured from 1 visual node.',
      ].join('\n'),
    );
  });

  it('measures CSG shapes and the whole scene', async () => {
    const floor = await tools().call('node_get_bounds', { path: 'Floor', scene: 'res://main.tscn' });
    const scene = await tools().call('node_get_bounds', { path: '.', scene: 'res://main.tscn' });

    expect(floor.text).toContain('center Vector3(0, -0.5, 0), size Vector3(20, 1, 20)');
    expect(scene.text).toContain('The scene root (Node3D) in res://main.tscn');
    expect(scene.text).toContain('from Vector3(-10, -1, -10) to Vector3(10, 2, 10)');
    expect(scene.text).toContain('Measured from 2 visual nodes.');
  });

  it('explains that the editor cannot render without a window', async () => {
    await tools().call('scene_open', { path: 'res://main.tscn' });

    const screenshot = await tools().call('editor_screenshot');

    expect(screenshot.isError).toBe(true);
    expect(screenshot.text).toContain('without a window');
  });

  it('measures a node of the running game by its collision shape', async () => {
    await tools().call('game_run');
    await tools().call('game_wait', { condition: 'is_on_floor()', node: 'Player', timeout_ms: 5000 });

    const bounds = await tools().call('node_get_bounds', { path: 'Player', in_game: true });

    expect(bounds.text).toContain('Player (CharacterBody3D) in the running game (res://main.tscn), in world coordinates:');
    expect(bounds.text).toContain('size Vector3(1, 2, 1)');
    expect(bounds.text).toContain('No visual nodes, so measured from 1 collision shape.');
  });

  it('checks the views of a game screenshot before it needs a window', async () => {
    const misspelled = await tools().call('game_screenshot', { views: [{ preset: 'front', target: 'Playr' }] });
    const plain = await tools().call('game_screenshot');

    expect(misspelled.isError).toBe(true);
    expect(misspelled.text).toContain('Similar: Player');
    expect(plain.isError).toBe(true);
    expect(plain.text).toContain('without a window');
  });

  it('plays input even when the screenshot after it cannot be taken', async () => {
    const played = await tools().call('game_input', { steps: [{ wait_ms: 50 }], screenshot: true });

    expect(played.isError).toBe(false);
    expect(played.text).toContain('Played 1 input step in');
    expect(played.text).toContain('No screenshot: The game runs without a window');
  });
});
