import type { ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startWindowedEditor, TemporaryProject } from './harness.js';

const windowTestsEnabled = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';

const playerScript = ['extends CharacterBody3D', '', 'const SPEED := 5.0', ''].join('\n');
const jumpingPlayerScript = ['extends CharacterBody3D', '', 'const SPEED := 5.0', 'const JUMP_VELOCITY := 4.5', ''].join('\n');

function scriptPrinting(identifier: string): string {
  return ['extends Node', '', '', 'func _ready() -> void:', `\tprint(${identifier})`, ''].join('\n');
}

function undeclaredIdentifierError(path: string, identifier: string): string {
  return `- in the editor: ${path}:5: Parse Error: Identifier "${identifier}" not declared in the current scope.`;
}

describe.skipIf(godotBinary === '' || !windowTestsEnabled)('rescanning with a window', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  function workspace(): TemporaryProject {
    if (project === undefined) {
      throw new Error('The project is not ready');
    }
    return project;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP rescan');
    project.write('player.gd', playerScript);
    editorProcess = await startWindowedEditor(project.root);
    session = await McpSession.connect(project.root);
    await session.call('editor_rescan');
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('reports the errors of two new scripts in a new folder with editor_rescan itself', async () => {
    mkdirSync(workspace().path('enemies'));
    workspace().write('enemies/goblin.gd', scriptPrinting('goblin_speed'));
    workspace().write('enemies/troll.gd', scriptPrinting('troll_speed'));

    const rescan = await tools().call('editor_rescan');
    const next = await tools().call('input_map_get');
    rmSync(workspace().path('enemies'), { recursive: true });

    expect(rescan.text).toContain(undeclaredIdentifierError('res://enemies/goblin.gd', 'goblin_speed'));
    expect(rescan.text).toContain(undeclaredIdentifierError('res://enemies/troll.gd', 'troll_speed'));
    expect(next.text).not.toContain('⚠');
  });

  it('reports the errors of a new script in a new folder right after a rescan that picked up a changed script', async () => {
    workspace().write('player.gd', jumpingPlayerScript);
    const pickedUp = await tools().call('editor_rescan');
    mkdirSync(workspace().path('levels'));
    workspace().write('levels/arena.gd', scriptPrinting('arena_size'));

    const rescan = await tools().call('editor_rescan');
    const next = await tools().call('input_map_get');
    rmSync(workspace().path('levels'), { recursive: true });

    expect(pickedUp.text).not.toContain('⚠');
    expect(rescan.text).toContain(undeclaredIdentifierError('res://levels/arena.gd', 'arena_size'));
    expect(next.text).not.toContain('⚠');
  });
});
