import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, startWindowedEditor, TemporaryProject, waitFor } from './harness.js';

const windowed = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';
const overrideRemovalTimeoutMs = 5_000;
const mainScene = ['[gd_scene format=3]', '', '[node name="Main" type="Node3D"]', ''].join('\n');

describe.skipIf(godotBinary === '')(`running the game at a window size from an editor ${windowed ? 'with' : 'without'} a window`, () => {
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
    project = new TemporaryProject('MCP window size', { mainScene: 'res://main.tscn' });
    project.write('main.tscn', mainScene);
    editorProcess = windowed ? await startWindowedEditor(project.root) : await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('gives the game the window size asked for', async () => {
    const run = await tools().call('game_run', { window_size: [1024, 768] });
    const root = await tools().call('game_get_properties', { path: '/root', names: ['size'] });

    expect(run.isError).toBe(false);
    expect(run.text).not.toContain('The game window is');
    expect(root.text).toContain('size = Vector2i(1024, 768)');
  });

  it('leaves no override of the project settings once the game stops', async () => {
    const overrideFile = project?.path('override.cfg') ?? '';

    await tools().call('game_stop');
    await waitFor(() => !existsSync(overrideFile), overrideRemovalTimeoutMs);

    expect(existsSync(overrideFile)).toBe(false);
  });
});
