import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { godotBinary, McpSession, TemporaryProject } from './harness.js';

const delayedErrorScript = [
  'extends Node',
  '',
  '',
  'func _ready() -> void:',
  '\tprint("Arena loaded")',
  '\tawait get_tree().create_timer(1.5).timeout',
  '\tvar missing: Node = null',
  '\tmissing.queue_free()',
  '',
].join('\n');

const mainScene = ['[gd_scene load_steps=2 format=3]', '', '[ext_resource type="Script" path="res://main.gd" id="1_script"]', '', '[node name="Main" type="Node"]', 'script = ExtResource("1_script")', ''].join('\n');

describe.skipIf(godotBinary === '')('running the game without the editor', () => {
  let project: TemporaryProject | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP local game', { mainScene: 'res://main.tscn', withRuntimeAutoload: true });
    project.write('main.gd', delayedErrorScript);
    project.write('main.tscn', mainScene);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary, GODOT_MCP_HEADLESS: '1' });
  });

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    project?.remove();
  });

  it('runs the main scene as a separate process', async () => {
    const run = await tools().call('game_run');

    expect(run.isError).toBe(false);
    expect(run.text).toMatch(/^The game is running res:\/\/main\.tscn; it was ready after \d+ ms\./);
    expect(run.text).toContain('Arena loaded');
  });

  it('reads later errors with their location', async () => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));

    const output = await tools().call('game_get_output', { levels: ['error'] });

    expect(output.text).toMatch(/ERROR res:\/\/main\.gd:8 in _ready: .*queue_free/);
  });

  it('stops the process', async () => {
    expect((await tools().call('game_stop')).text).toBe('Stopped the game.');
    expect((await tools().call('game_stop')).text).toBe('The game was not running.');
  });

  it('cannot run the current scene without the editor', async () => {
    const run = await tools().call('game_run', { scene: 'current' });

    expect(run.isError).toBe(true);
    expect(run.text).toContain('There is no current scene without the Godot editor');
  });
});
