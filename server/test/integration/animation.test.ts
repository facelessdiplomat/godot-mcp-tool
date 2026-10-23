import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

describe.skipIf(godotBinary === '')('animating a door', () => {
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
    project = new TemporaryProject('MCP animation');
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('creates an animation that slides the door up', async () => {
    await tools().call('scene_create', { path: 'res://level.tscn', root_type: 'Node3D' });
    await tools().call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'CSGBox3D', name: 'Door', properties: { size: [2, 3, 0.2], position: [0, 1.5, 0] } },
        { op: 'node_add', type: 'AnimationPlayer', name: 'AnimationPlayer' },
      ],
    });

    const created = await tools().call('animation_set', {
      player: 'AnimationPlayer',
      name: 'open',
      length: 1,
      tracks: [{ path: 'Door:position', keys: [{ time: 0, value: [0, 1.5, 0] }, { time: 1, value: [0, 4.5, 0] }] }],
    });

    expect(created.isError).toBe(false);
    expect(created.text).toContain('Created the animation open (1 s, loop none) of AnimationPlayer in res://level.tscn as one Undo step');
    expect(created.text).toContain('- Door:position: 2 keys from Vector3(0, 1.5, 0) to Vector3(0, 4.5, 0), linear, continuous');
  });

  it('reads the animation back', async () => {
    const listed = await tools().call('animation_get', { player: 'AnimationPlayer' });
    const detailed = await tools().call('animation_get', { player: 'AnimationPlayer', name: 'open' });

    expect(listed.text).toContain('- open: 1 s, loop none, 1 track');
    expect(detailed.text).toContain('- Door:position (value, linear, continuous): 0 s Vector3(0, 1.5, 0); 1 s Vector3(0, 4.5, 0)');
  });

  it('plays the animation in the running game', async () => {
    await tools().call('node_set_properties', { path: 'AnimationPlayer', properties: { autoplay: 'open' } });
    await tools().call('scene_save');
    const run = await tools().call('game_run', { scene: 'res://level.tscn' });

    const opened = await tools().call('game_wait', { condition: 'position.y > 4.4', node: 'Door', timeout_ms: 5000 });

    expect(run.text).toMatch(/^The game is running res:\/\/level\.tscn/);
    expect(opened.text).toMatch(/^"position\.y > 4\.4" became true on Door/);
  });

  it('deletes the animation', async () => {
    await tools().call('game_stop');

    const deleted = await tools().call('animation_delete', { player: 'AnimationPlayer', name: 'open' });
    const listed = await tools().call('animation_get', { player: 'AnimationPlayer' });

    expect(deleted.text).toBe('Deleted the animation open of AnimationPlayer in res://level.tscn as one Undo step; the scene has unsaved changes.');
    expect(listed.text).toBe(
      ['AnimationPlayer in res://level.tscn: tracks animate nodes from .., autoplay none', 'Animations:', '- RESET: 0.001 s, loop none, 1 track'].join('\n'),
    );
  });
});
