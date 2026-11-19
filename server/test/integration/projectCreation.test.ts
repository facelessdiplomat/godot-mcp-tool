import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, stopDiscoveredEditor } from './harness.js';

describe.skipIf(godotBinary === '')('making a game from scratch in an empty folder', () => {
  let folder = '';
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  beforeAll(async () => {
    folder = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-empty-folder-')));
    session = await McpSession.connect(folder, { GODOT_BIN: godotBinary });
  });

  afterAll(async () => {
    await session?.close();
    await stopDiscoveredEditor(folder);
    rmSync(folder, { recursive: true, force: true });
  });

  it(
    'creates the project, starts its editor and reads its main scene without restarting the server',
    async () => {
      const before = await tools().call('godot_status');
      const created = await tools().call('project_create', { name: 'Capsule Walk' });
      const launched = await tools().call('editor_launch', { headless: true });
      const tree = await tools().call('scene_get_tree', { scene: 'main' });
      const info = await tools().call('project_info');

      expect(before.text).toContain('Project: not found.');
      expect(created.text).toContain(`Created the Godot project "Capsule Walk" in ${folder}`);
      expect(created.text).toContain('The server now works on this project');
      expect(readFileSync(join(folder, 'project.godot'), 'utf8')).toMatch(/config\/features=PackedStringArray\("4\.\d+", "Forward Plus"\)/);
      expect(launched.text).toMatch(/^Started the Godot editor for .+ with the plugin \d+\.\d+\.\d+, connected after/);
      expect(tree.text).toContain('Main: Node3D');
      expect(tree.text).toContain('Camera: Camera3D');
      expect(info.text).toContain('Capsule Walk');
    },
    editorStartupTimeoutMs + 60_000,
  );

  it('warns about a declaration without a static type in the new project, through the editor', async () => {
    writeFileSync(join(folder, 'player.gd'), ['extends Node', '', 'var speed = 5', ''].join('\n'));
    await tools().call('editor_rescan');

    const checked = await tools().call('script_validate', { paths: ['res://player.gd'] });

    expect(checked.text).toContain("checked with the editor's language server");
    expect(checked.text).toMatch(/3:\d+ warning \(UNTYPED_DECLARATION\)/);
  });

  it('says that godot --check-only cannot show that warning once the editor is closed', async () => {
    await stopDiscoveredEditor(folder);

    const checked = await tools().call('script_validate', { paths: ['res://player.gd'] });

    expect(checked.isError).toBe(false);
    expect(checked.text).toContain('godot --check-only, which finds errors but not warnings');
  });
});
