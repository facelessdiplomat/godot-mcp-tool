import type { ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const unsafeToolsAllowed = ['[godot_mcp_tool]', '', 'allow_unsafe_tools=true', ''].join('\n');
const savingScript = ['extends Node3D', '', '', 'func _ready() -> void:', '\tvar file := FileAccess.open("user://save.json", FileAccess.WRITE)', '\tfile.store_string("{\\"best\\": 42}")', ''].join('\n');
const mainScene = [
  '[gd_scene load_steps=2 format=3]',
  '',
  '[ext_resource type="Script" path="res://main.gd" id="1_main"]',
  '',
  '[node name="Main" type="Node3D"]',
  'script = ExtResource("1_main")',
  '',
].join('\n');
const userFolderPattern = /^The user data of the game is in (?<folder>.+)\.$/m;

describe.skipIf(godotBinary === '')('the user data of the game', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;
  let userFolder = '';

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP user data', { mainScene: 'res://main.tscn' });
    mkdirSync(project.path('.godot/editor'), { recursive: true });
    project.write('.godot/editor/project_metadata.cfg', unsafeToolsAllowed);
    project.write('main.gd', savingScript);
    project.write('main.tscn', mainScene);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_MCP_UNSAFE: '1' });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
    if (userFolder !== '') {
      rmSync(userFolder, { recursive: true, force: true });
    }
  });

  it('lists and reads what the game saved', async () => {
    await tools().call('game_run');
    await tools().call('game_stop');

    const listing = await tools().call('user_data_get');
    const saved = await tools().call('user_data_get', { path: 'save.json' });
    userFolder = userFolderPattern.exec(listing.text)?.groups?.['folder'] ?? '';

    expect(listing.text).toMatch(/^- user:\/\/save\.json, 12 bytes, changed /m);
    expect(userFolder).toContain('MCP user data');
    expect(saved.text).toContain('{"best": 42}');
  });

  it('moves a saved game to the trash, so that it is gone', async () => {
    const deleted = await tools().call('user_data_delete', { paths: ['user://save.json'] });
    const gone = await tools().call('user_data_get', { path: 'user://save.json' });

    expect(deleted.text).toBe('Moved to the trash from the user data of the game: user://save.json');
    expect(gone.isError).toBe(true);
    expect(gone.text).toContain('user://save.json does not exist');
  });
});
