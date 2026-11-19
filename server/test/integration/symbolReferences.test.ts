import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, findFreePort, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const enemyScript = [
  'class_name Enemy',
  'extends Node3D',
  '',
  'signal died',
  '',
  'var health := 10',
  '',
  '',
  'func take_damage(amount: int = 1) -> void:',
  '\thealth -= amount',
  '\tif health <= 0:',
  '\t\tdied.emit()',
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
  'var anything',
  '',
  '',
  'func hit() -> void:',
  '\ttarget.take_damage(1)',
  '\tanything.take_damage(4)',
  '\tif target.has_method("take_damage"):',
  '\t\ttarget.call("take_damage", 3)',
  '',
].join('\n');

describe.skipIf(godotBinary === '')('finding the uses of a symbol across scripts and scenes', () => {
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
    project = new TemporaryProject('MCP references', { mainScene: 'res://arena.tscn' });
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

  it('lists the declaration, the traced calls, the connection and the method track, and the calls to check by hand', async () => {
    const found = await tools().call('script_find_references', { path: 'res://enemy.gd', symbol: 'take_damage' });

    expect(found.isError).toBe(false);
    const lines = found.text.split('\n');
    expect(lines[0]).toBe('take_damage is a function of res://enemy.gd, declared at res://enemy.gd:9: func take_damage(amount: int = 1) -> void:');
    expect(lines).toContain('- res://enemy.gd:16: take_damage(2)');
    expect(lines).toContain('- res://player.gd:8: target.take_damage(1)');
    expect(found.text).toMatch(/^- res:\/\/arena\.tscn:\d+: a signal connection to Goblin: \[connection signal="body_entered" from="Spikes" to="Goblin" method="take_damage"\]$/m);
    expect(found.text).toMatch(/^- res:\/\/arena\.tscn:\d+: 1 method track key: .*"method": &"take_damage"/m);
    expect(lines).toContain('- res://player.gd:9: anything.take_damage(4)');
    expect(lines).toContain('- res://player.gd:10: if target.has_method("take_damage"):');
    expect(lines).toContain('- res://player.gd:11: target.call("take_damage", 3)');
  });

  it('finds where a signal is emitted and connected', async () => {
    const found = await tools().call('script_find_references', { path: 'res://enemy.gd', symbol: 'died' });

    expect(found.text.split('\n')).toContain('- res://enemy.gd:12: died.emit()');
    expect(found.text).toContain('No signal connection, method track key, saved value or animated property in scenes and resources.');
  });
});
