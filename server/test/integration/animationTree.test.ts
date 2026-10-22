import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const currentState = (state: string): string => `get("parameters/playback").get_current_node() == "${state}"`;

describe.skipIf(godotBinary === '')('an animation state machine for a character', () => {
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
    project = new TemporaryProject('MCP animation tree');
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('gives a character an idle and a walk animation', async () => {
    await tools().call('scene_create', { path: 'res://character.tscn', root_type: 'Node3D' });
    await tools().call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'MeshInstance3D', name: 'Body', properties: { mesh: { new: 'BoxMesh' } } },
        { op: 'node_add', type: 'AnimationPlayer', name: 'AnimationPlayer' },
        { op: 'node_add', type: 'AnimationTree', name: 'AnimationTree' },
      ],
    });

    const idle = await tools().call('animation_set', {
      player: 'AnimationPlayer',
      name: 'idle',
      loop: 'pingpong',
      tracks: [{ path: 'Body:scale:y', keys: [{ time: 0, value: 1 }, { time: 1, value: 1.05 }] }],
    });
    const walk = await tools().call('animation_set', {
      player: 'AnimationPlayer',
      name: 'walk',
      loop: 'linear',
      tracks: [{ path: 'Body:rotation_degrees:z', keys: [{ time: 0, value: -5 }, { time: 0.5, value: 5 }, { time: 1, value: -5 }] }],
    });

    expect(idle.isError).toBe(false);
    expect(walk.isError).toBe(false);
  });

  it('sets up the state machine and reads it back', async () => {
    const setUp = await tools().call('animation_tree_set', {
      tree: 'AnimationTree',
      player: 'AnimationPlayer',
      states: [
        { name: 'idle', animation: 'idle' },
        { name: 'walk', animation: 'walk' },
      ],
      transitions: [
        { from: 'Start', to: 'idle' },
        { from: 'idle', to: 'walk', condition: 'moving', xfade: 0.2 },
        { from: 'walk', to: 'idle', condition: 'stopped', xfade: 0.2 },
      ],
    });
    const read = await tools().call('animation_tree_get', { tree: 'AnimationTree' });

    expect(setUp.isError).toBe(false);
    expect(setUp.text).toContain('Set up the state machine of AnimationTree in res://character.tscn with animations from AnimationPlayer as one Undo step');
    expect(read.text).toContain('- idle -> walk: auto when moving, immediate, xfade 0.2 s');
    expect(read.text).toContain('Conditions: moving, stopped, set as parameters/conditions/<name>');
  });

  it('switches from idle to walk in the running game when the condition is set', async () => {
    await tools().call('scene_save');
    await tools().call('game_run', { scene: 'res://character.tscn' });

    const idling = await tools().call('game_wait', { condition: currentState('idle'), node: 'AnimationTree', timeout_ms: 5000 });
    const moving = await tools().call('game_set_properties', { path: 'AnimationTree', properties: { 'parameters/conditions/moving': true } });
    const walking = await tools().call('game_wait', { condition: currentState('walk'), node: 'AnimationTree', timeout_ms: 5000 });

    expect(idling.text).toMatch(/became true on AnimationTree/);
    expect(moving.isError).toBe(false);
    expect(walking.text).toMatch(/became true on AnimationTree/);
  });
});
