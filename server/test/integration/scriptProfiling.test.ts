import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const slowScript = [
  'extends Node3D',
  '',
  'var total := 0.0',
  '',
  '',
  'func _ready() -> void:',
  '\tPerformance.add_custom_monitor("game/total", func() -> float: return total)',
  '',
  '',
  'func _process(_delta: float) -> void:',
  '\ttotal += find_path(3000)',
  '\ttotal += cheap()',
  '',
  '',
  'func find_path(steps: int) -> float:',
  '\tvar sum := 0.0',
  '\tfor step in steps:',
  '\t\tsum += sqrt(float(step))',
  '\treturn sum',
  '',
  '',
  'func cheap() -> float:',
  '\treturn 1.0',
  '',
].join('\n');

const slowScene = ['[gd_scene load_steps=2 format=3]', '', '[ext_resource type="Script" path="res://slow.gd" id="1_slow"]', '', '[node name="Main" type="Node3D"]', 'script = ExtResource("1_slow")', ''].join('\n');

describe.skipIf(godotBinary === '')('timing the script functions of the running game', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  beforeAll(async () => {
    project = new TemporaryProject('MCP profiling', { mainScene: 'res://main.tscn' });
    project.write('slow.gd', slowScript);
    project.write('main.tscn', slowScene);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('names the slow function first, with its file and line, and reads the custom monitor', async () => {
    await session?.call('game_run');

    const measured = await session?.call('game_performance', { frames: 30 });

    expect(measured?.text).toContain('Custom monitors: game/total average ');
    expect(measured?.text).toContain('Functions that took the most script time of their own over these frames:');
    expect(measured?.text).toMatch(/Functions that took the most script time of their own over these frames:\n- find_path \(res:\/\/slow\.gd:16\): /);
    expect(measured?.text).not.toContain('res://addons/godot_mcp_tool');
  });
});
