import type { ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const mainScene = ['[gd_scene format=3]', '', '[node name="Main" type="Node3D"]', '', '[node name="Music" type="AudioStreamPlayer" parent="."]', ''].join('\n');

function editorEnded(editorProcess: ChildProcess): Promise<void> {
  return new Promise((resolveEnd) => {
    editorProcess.once('exit', () => {
      resolveEnd();
    });
    editorProcess.kill('SIGKILL');
  });
}

describe.skipIf(godotBinary === '')('the audio buses of a project', () => {
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
    project = new TemporaryProject('MCP audio buses', { mainScene: 'res://main.tscn' });
    project.write('main.tscn', mainScene);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('adds buses, saves the layout and plays a player on its bus in the game', async () => {
    const before = await tools().call('audio_buses_get');
    const added = await tools().call('audio_buses_set', { buses: [{ name: 'Music', volume_db: -6 }, { name: 'Effects' }] });
    const assigned = await tools().call('node_set_properties', { scene: 'res://main.tscn', path: 'Music', properties: { bus: 'Music' } });
    await tools().call('scene_save', { scene: 'res://main.tscn' });
    await tools().call('game_run');
    const playing = await tools().call('game_get_properties', { path: 'Music', names: ['bus'] });
    await tools().call('game_stop');

    expect(before.text).toBe(
      'The project has no bus layout file yet, only Master; audio_buses_set saves the buses to res://default_bus_layout.tres.\n- Master: 0 dB, plays to the speakers',
    );
    expect(added.text).toContain('Added Music and Effects, and saved the bus layout to res://default_bus_layout.tres:\n- Master: 0 dB, plays to the speakers\n- Music: -6 dB, sends to Master\n- Effects: 0 dB, sends to Master');
    expect(readFileSync(project?.path('default_bus_layout.tres') ?? '', 'utf8')).toContain('bus/1/name = &"Music"');
    expect(assigned.isError).toBe(false);
    expect(assigned.text).toContain('Applied: bus');
    expect(playing.text).toContain('bus = "Music"  [StringName]');
  });

  it('reads the saved buses without the editor', async () => {
    await tools().close();
    if (editorProcess !== undefined) {
      await editorEnded(editorProcess);
    }
    session = await McpSession.connect(project?.root ?? '', { GODOT_BIN: godotBinary });

    const layout = await tools().call('audio_buses_get');

    expect(layout.text).toBe(
      ['The audio buses of the project, saved in res://default_bus_layout.tres:', '- Master: 0 dB, plays to the speakers', '- Music: -6 dB, sends to Master', '- Effects: 0 dB, sends to Master'].join('\n'),
    );
  });
});
