import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const fallerScript = [
  'extends CharacterBody3D',
  '',
  'var ticks := 0',
  'var last_process_delta := 0.0',
  '',
  '',
  'func _process(delta: float) -> void:',
  '\tlast_process_delta = delta',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tticks += 1',
  '\tvelocity += get_gravity() * delta',
  '\tmove_and_slide()',
  '',
].join('\n');

const fallScene = [
  '[gd_scene load_steps=3 format=3]',
  '',
  '[ext_resource type="Script" path="res://faller.gd" id="1_faller"]',
  '',
  '[sub_resource type="SphereShape3D" id="SphereShape3D_faller"]',
  '',
  '[node name="Fall" type="Node3D"]',
  '',
  '[node name="Faller" type="CharacterBody3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 100, 0)',
  'script = ExtResource("1_faller")',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Faller"]',
  'shape = SubResource("SphereShape3D_faller")',
  '',
].join('\n');

function numberAfter(text: string, name: string): number {
  const match = new RegExp(`${name} = (-?[\\d.e+-]+)`).exec(text);
  return Number(match?.[1]);
}

describe.skipIf(godotBinary === '')('controlling the time of the running game', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  async function ticks(): Promise<number> {
    return numberAfter((await tools().call('game_get_properties', { path: 'Faller', names: ['ticks'] })).text, 'ticks');
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP game control', { mainScene: 'res://fall.tscn' });
    project.write('faller.gd', fallerScript);
    project.write('fall.tscn', fallScene);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('runs the game with a fixed frame rate', async () => {
    const run = await tools().call('game_run', { fixed_fps: 60 });
    await tools().call('game_wait', { physics_frames: 10 });
    const properties = await tools().call('game_get_properties', { path: 'Faller', names: ['last_process_delta'] });

    expect(run.text).toContain('Every frame advances the game by exactly 1/60 s');
    expect(numberAfter(properties.text, 'last_process_delta')).toBeCloseTo(1 / 60, 6);
  });

  it('pauses the game so that nothing moves', async () => {
    const paused = await tools().call('game_pause');
    const ticksWhenPaused = await ticks();
    await tools().call('game_wait', { physics_frames: 20 });

    expect(paused.text).toMatch(/^Paused the game at physics frame \d+\./);
    expect(await ticks()).toBe(ticksWhenPaused);
  });

  it('steps the paused game by exact physics frames', async () => {
    const before = await ticks();
    const stepped = await tools().call('game_step', { physics_frames: 10 });

    expect(stepped.text).toMatch(/^Advanced the game by 10 physics frames to physics frame \d+; it stays paused\.$/);
    expect(await ticks()).toBe(before + 10);
  });

  it('measures the performance of the paused game', async () => {
    const measured = await tools().call('game_performance', { frames: 10 });

    expect(measured.text).toContain('Performance of the running game (res://fall.tscn) over 10 frames:');
    expect(measured.text).toContain('The game is paused, so these numbers show an idle game.');
    expect(measured.text).toContain('Rendering: none, the game runs without a window');
    expect(measured.text).toMatch(/Objects: \d+, nodes: \d+, orphan nodes: 0, resources: \d+/);
  });

  it('resumes the game', async () => {
    const resumed = await tools().call('game_pause', { paused: false });
    const before = await ticks();
    await tools().call('game_wait', { physics_frames: 5 });

    expect(resumed.text).toMatch(/^Resumed the game at physics frame \d+\.$/);
    expect(await ticks()).toBeGreaterThan(before);
  });
});
