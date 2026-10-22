import type { ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, findFreePort, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const playerScript = ['extends CharacterBody3D', '', '@export var speed := 5.0', '', '', 'func _physics_process(_delta: float) -> void:', '\tvelocity.x = speed', '\tmove_and_slide()', ''].join('\n');
const brokenScript = ['extends Node', '', '', 'func _ready() -> void:', '\tvar x = 1 2', '\tprint(x)', ''].join('\n');
const unusedScript = ['extends Node', '', '', 'func _ready() -> void:', '\tvar unused_value := 3', ''].join('\n');

function writeScripts(project: TemporaryProject): void {
  project.write('player.gd', playerScript);
  project.write('broken.gd', brokenScript);
  project.write('unused.gd', unusedScript);
}

describe.skipIf(godotBinary === '')('checking scripts with the editor', () => {
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
    project = new TemporaryProject('MCP scripts');
    writeScripts(project);
    const languageServerPort = await findFreePort();
    editorProcess = await startHeadlessEditor(project.root, languageServerPort);
    session = await McpSession.connect(project.root, { GODOT_LSP_PORT: String(languageServerPort) });
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('finds errors and warnings with their places', async () => {
    const result = await tools().call('script_validate', { paths: ['res://'] });

    expect(result.isError).toBe(false);
    expect(result.text).toContain("1 error and 1 warning in 2 of 3 scripts (checked with the editor's language server).");
    expect(result.text).toMatch(/res:\/\/broken\.gd\n {2}5:\d+ error: /);
    expect(result.text).toMatch(/res:\/\/unused\.gd\n {2}5:\d+ warning \(UNUSED_VARIABLE\): /);
    expect(result.text).toContain('No problems: res://player.gd');
  });

  it('knows the classes of scripts written after the editor started', async () => {
    mkdirSync(project?.path('enemies') ?? '');
    project?.write('enemies/goblin.gd', 'class_name Goblin\nextends Node3D\n\nvar health := 3\n');
    project?.write('spawner.gd', 'extends Node\n\n\nfunc spawn() -> Goblin:\n\treturn Goblin.new()\n');

    const result = await tools().call('script_validate', { paths: ['res://spawner.gd', 'res://enemies'] });

    expect(result.text).toBe("No problems in 2 scripts: res://spawner.gd, res://enemies/goblin.gd (checked with the editor's language server).");
  });

  it('explains a path that does not exist', async () => {
    const result = await tools().call('script_validate', { paths: ['res://missing.gd'] });

    expect(result).toEqual({ isError: true, text: 'res://missing.gd does not exist.' });
  });
});

describe.skipIf(godotBinary === '')('checking scripts without the editor', () => {
  let project: TemporaryProject | undefined;
  let session: McpSession | undefined;

  beforeAll(async () => {
    project = new TemporaryProject('MCP scripts without editor');
    writeScripts(project);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
  });

  afterAll(async () => {
    await session?.close();
    project?.remove();
  });

  it('falls back to godot --check-only', async () => {
    const result = await session?.call('script_validate', { paths: ['res://'] });

    expect(result?.text).toContain('1 error in 1 of 3 scripts (checked with godot --check-only, which finds errors but not warnings).');
    expect(result?.text).toMatch(/res:\/\/broken\.gd\n {2}5 error: /);
  });
});
