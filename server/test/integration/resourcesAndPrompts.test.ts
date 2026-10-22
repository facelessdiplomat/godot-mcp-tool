import type { ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const mainScript = ['extends Node3D', '', '', 'func _ready() -> void:', '\tvar missing: Node = get_node_or_null("Missing")', '\tmissing.queue_free()', ''].join('\n');

const mainScene = [
  '[gd_scene load_steps=2 format=3]',
  '',
  '[ext_resource type="Script" path="res://main.gd" id="1_main"]',
  '',
  '[node name="Main" type="Node3D"]',
  'script = ExtResource("1_main")',
  '',
  '[node name="Floor" type="Node3D" parent="."]',
  '',
].join('\n');

const arenaScene = ['[gd_scene format=3]', '', '[node name="Arena" type="Node3D"]', ''].join('\n');

function textOf(contents: readonly ({ readonly text: string } | { readonly blob: string })[]): string {
  return contents.map((content) => ('text' in content ? content.text : '')).join('\n');
}

describe.skipIf(godotBinary === '')('MCP resources and prompts', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function connected(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  async function read(uri: string): Promise<string> {
    return textOf((await connected().client.readResource({ uri })).contents);
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP resources and prompts', { mainScene: 'res://main.tscn' });
    project.write('main.gd', mainScript);
    project.write('main.tscn', mainScene);
    mkdirSync(project.path('levels'));
    project.write('levels/arena.tscn', arenaScene);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('lists the scenes of the project as resources', async () => {
    const { resources } = await connected().client.listResources();

    expect(resources.map((resource) => resource.uri)).toEqual(['godot://project', 'godot://logs/last-run', 'godot://scene/levels/arena.tscn', 'godot://scene/main.tscn']);
  });

  it('reads the project, a scene and a class reference', async () => {
    expect(await read('godot://project')).toContain('Project: MCP resources and prompts');
    expect(await read('godot://scene/main.tscn')).toContain('Main: Node3D [script res://main.gd]');
    expect(await read('godot://docs/CharacterBody3D')).toContain('move_and_slide');
  });

  it('hands the errors of the last run to fix_last_run', async () => {
    await connected().call('game_run');

    const prompt = await connected().client.getPrompt({ name: 'fix_last_run' });
    const [message] = prompt.messages;
    const text = message?.content.type === 'text' ? message.content.text : '';

    expect(text).toMatch(/^Fix the errors of the last game run\./);
    expect(text).toContain('res://main.gd:6');
    expect(await read('godot://logs/last-run')).toContain('res://main.gd:6');
  });
});
