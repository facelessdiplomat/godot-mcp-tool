import type { ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, findFreePort, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const playerScript = ['extends CharacterBody3D', '', '@export var speed := 5.0', '', '', 'func _physics_process(_delta: float) -> void:', '\tvelocity.x = speed', '\tmove_and_slide()', ''].join('\n');
const brokenScript = ['extends Node', '', '', 'func _ready() -> void:', '\tvar x = 1 2', '\tprint(x)', ''].join('\n');
const unusedScript = ['extends Node', '', '', 'func _ready() -> void:', '\tvar unused_value := 3', ''].join('\n');
const brokenShader = ['shader_type spatial;', '', 'void fragment() {', '\tALBEDO = vec3(1.0, 0.0);', '}', ''].join('\n');
const includingShader = ['shader_type spatial;', '', '#include "colors.gdshaderinc"', '', 'void fragment() {', '\tALBEDO = warm();', '}', ''].join('\n');
const shaderInclude = ['vec3 warm() {', '\treturn vec3(1.0, 0.5, 0.0);', '}', ''].join('\n');
const shaderError = '  4 error: Invalid arguments for the built-in function: "vec3(float,float)".';

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
    editorProcess = await startHeadlessEditor(project.root, { languageServer: languageServerPort });
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

  it('compiles shaders and reports the first error of each without leaving it among the new editor errors', async () => {
    mkdirSync(project?.path('shaders') ?? '');
    project?.write('shaders/water.gdshader', brokenShader);
    project?.write('shaders/colors.gdshaderinc', shaderInclude);
    project?.write('shaders/lit.gdshader', includingShader);

    const result = await tools().call('script_validate', { paths: ['res://shaders'] });
    const next = await tools().call('project_info');

    expect(result.text).toBe(
      [
        "1 error in 1 of 2 shaders (compiled by Godot's shader compiler, which stops at the first error of each shader).",
        'res://shaders/water.gdshader',
        shaderError,
        'No problems: res://shaders/lit.gdshader',
      ].join('\n'),
    );
    expect(next.text).not.toContain('⚠');
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

  it('compiles shaders in Godot without a window', async () => {
    project?.write('water.gdshader', brokenShader);

    const result = await session?.call('script_validate', { paths: ['res://water.gdshader'] });

    expect(result?.text).toBe(
      ["1 error in 1 of 1 shader (compiled by Godot's shader compiler, which stops at the first error of each shader).", 'res://water.gdshader', shaderError].join('\n'),
    );
  });
});
