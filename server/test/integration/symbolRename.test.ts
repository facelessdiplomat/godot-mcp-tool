import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, findFreePort, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const enemyScript = [
  'class_name Enemy',
  'extends Node3D',
  '',
  'var health := 10',
  '',
  '',
  'func take_damage(amount: int = 1) -> void:',
  '\thealth -= amount',
  '',
  '',
  'func _on_spikes_body_entered(_body: Node3D) -> void:',
  '\ttake_damage(2)',
  '',
].join('\n');

const playerScript = [
  'extends Node3D',
  '',
  'var target: Enemy',
  '',
  '',
  'func hit() -> void:',
  '\ttarget.take_damage(1)',
  '\tif target.has_method("take_damage"):',
  '\t\tprint("still there")',
  '',
].join('\n');

describe.skipIf(godotBinary === '')('renaming a symbol across scripts and scenes', () => {
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
    project = new TemporaryProject('MCP rename', { mainScene: 'res://arena.tscn' });
    project.write('enemy.gd', enemyScript);
    project.write('player.gd', playerScript);
    const languageServerPort = await findFreePort();
    editorProcess = await startHeadlessEditor(project.root, { languageServer: languageServerPort });
    session = await McpSession.connect(project.root, { GODOT_LSP_PORT: String(languageServerPort) });
    await session.call('scene_create', { path: 'res://arena.tscn', root_type: 'Node3D' });
    await session.call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'Node3D', name: 'Goblin', properties: { script: 'res://enemy.gd' } },
        { op: 'node_add', type: 'Node3D', name: 'Player', properties: { script: 'res://player.gd' } },
        { op: 'node_add', type: 'Area3D', name: 'Spikes' },
        { op: 'node_add', type: 'AnimationPlayer', name: 'AnimationPlayer' },
        { op: 'signal_connect', from: 'Spikes', signal: 'body_entered', to: 'Goblin', method: 'take_damage' },
      ],
    });
    await session.call('animation_set', {
      player: 'AnimationPlayer',
      name: 'hurt',
      length: 1,
      tracks: [{ type: 'method', path: 'Goblin', keys: [{ time: 0.5, method: 'take_damage', args: [3] }] }],
    });
    await session.call('scene_save');
  }, editorStartupTimeoutMs + 60_000);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('renames the function in the scripts, the signal connection and the method track, and lists the string it left', async () => {
    const renamed = await tools().call('script_rename_symbol', { path: 'res://enemy.gd', symbol: 'take_damage', new_name: 'apply_damage' });
    const arena = project?.read('arena.tscn') ?? '';
    const validated = await tools().call('script_validate', { paths: ['res://'] });

    expect(renamed.isError).toBe(false);
    expect(renamed.text).toContain('Renamed the function take_damage of res://enemy.gd to apply_damage');
    expect(renamed.text).toContain('res://arena.tscn: 1 signal connection, 1 method track key');
    expect(renamed.text).toContain('- res://player.gd:8: if target.has_method("take_damage"):');
    expect(project?.read('enemy.gd')).toContain('func apply_damage(amount: int = 1) -> void:');
    expect(project?.read('enemy.gd')).toContain('\tapply_damage(2)');
    expect(project?.read('player.gd')).toContain('\ttarget.apply_damage(1)');
    expect(arena).toContain('method="apply_damage"');
    expect(arena).toContain('"method": &"apply_damage"');
    expect(arena).not.toContain('"method": &"take_damage"');
    expect(validated.text).toMatch(/^No problems in 2 scripts/);
  });
});
