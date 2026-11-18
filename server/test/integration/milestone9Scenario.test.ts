import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, findFreePort, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const enemyScript = [
  'class_name Enemy',
  'extends Node3D',
  '',
  'var health := 100',
  '',
  '',
  'func take_damage(amount: int = 1) -> void:',
  '\thealth -= amount',
  '',
].join('\n');

const worldScript = [
  'extends Node3D',
  '',
  'var total := 0.0',
  '',
  '',
  'func _process(_delta: float) -> void:',
  '\ttotal += plan_routes(4000)',
  '\t($Goblin as Enemy).take_damage(0)',
  '',
  '',
  'func plan_routes(steps: int) -> float:',
  '\tvar sum := 0.0',
  '\tfor step in steps:',
  '\t\tsum += sqrt(float(step))',
  '\treturn sum',
  '',
].join('\n');

describe.skipIf(godotBinary === '')('the milestone 9 scenario: rename take_damage everywhere and find the slow function', () => {
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
    project = new TemporaryProject('MCP milestone 9', { mainScene: 'res://world.tscn' });
    project.write('enemy.gd', enemyScript);
    project.write('world.gd', worldScript);
    const languageServerPort = await findFreePort();
    editorProcess = await startHeadlessEditor(project.root, { languageServer: languageServerPort });
    session = await McpSession.connect(project.root, { GODOT_LSP_PORT: String(languageServerPort) });
    await session.call('scene_create', { path: 'res://world.tscn', root_type: 'Node3D' });
    await session.call('scene_batch_edit', {
      operations: [
        { op: 'node_set_properties', path: '.', properties: { script: 'res://world.gd' } },
        { op: 'node_add', type: 'Node3D', name: 'Goblin', properties: { script: 'res://enemy.gd' } },
        { op: 'node_add', type: 'Area3D', name: 'Spikes' },
        { op: 'node_add', type: 'AnimationPlayer', name: 'AnimationPlayer' },
        { op: 'signal_connect', from: 'Spikes', signal: 'body_entered', to: 'Goblin', method: 'take_damage' },
      ],
    });
    await session.call('animation_set', {
      player: 'AnimationPlayer',
      name: 'trap',
      length: 1,
      loop: 'linear',
      tracks: [{ type: 'method', path: 'Goblin', keys: [{ time: 0.5, method: 'take_damage', args: [1] }] }],
    });
    await session.call('scene_save');
  }, editorStartupTimeoutMs + 60_000);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('renames take_damage in the scripts, the signal connection and the method track, and the game runs without errors', async () => {
    const renamed = await tools().call('script_rename_symbol', { path: 'res://enemy.gd', symbol: 'take_damage', new_name: 'apply_damage' });
    const world = project?.read('world.tscn') ?? '';
    await tools().call('game_run');
    const errors = await tools().call('game_get_output', { levels: ['error'] });

    expect(renamed.isError).toBe(false);
    expect(renamed.text).not.toContain('Still named take_damage');
    expect(project?.read('enemy.gd')).toContain('func apply_damage(');
    expect(project?.read('world.gd')).toContain('.apply_damage(0)');
    expect(world).toContain('method="apply_damage"');
    expect(world).toContain('"method": &"apply_damage"');
    expect(world).not.toContain('take_damage');
    expect(errors.text).not.toMatch(/error/i);
  });

  it('names the slow function from the profile of the running game', async () => {
    const measured = await tools().call('game_performance', { frames: 30 });

    expect(measured.text).toMatch(/Functions that took the most script time of their own over these frames:\n- plan_routes \(res:\/\/world\.gd:\d+\): /);
  });
});
