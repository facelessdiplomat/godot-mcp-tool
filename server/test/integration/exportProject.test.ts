import type { ChildProcess } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

interface HostPlatform {
  readonly name: string;
  readonly folder: string;
  readonly file: string;
}

const hostPlatforms: Readonly<Partial<Record<NodeJS.Platform, HostPlatform>>> = {
  darwin: { name: 'macOS', folder: 'macos', file: 'game.zip' },
  linux: { name: 'Linux', folder: 'linux', file: 'game.x86_64' },
  win32: { name: 'Windows Desktop', folder: 'windows', file: 'game.exe' },
};
const host = hostPlatforms[process.platform];

const mainScene = ['[gd_scene format=3]', '', '[node name="Main" type="Node3D"]', ''].join('\n');

const quitScript = ['extends Node3D', '', '', 'func _ready() -> void:', '\tprint("The exported game runs")', '\tget_tree().quit()', ''].join('\n');

function presetFor(platform: HostPlatform): string {
  return [
    '[preset.0]',
    '',
    `name="${platform.name}"`,
    `platform="${platform.name}"`,
    'runnable=true',
    'export_filter="all_resources"',
    'include_filter=""',
    'exclude_filter=""',
    `export_path="build/${platform.folder}/${platform.file}"`,
    '',
  ].join('\n');
}

describe.skipIf(godotBinary === '' || host === undefined)('exporting the game', () => {
  const platform = host ?? { name: '', folder: '', file: '' };
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  function scratch(): TemporaryProject {
    if (project === undefined) {
      throw new Error('The project is not ready');
    }
    return project;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP export', { mainScene: 'res://main.tscn' });
    project.write('main.tscn', mainScene);
    project.write('main.gd', quitScript);
    project.write('export_presets.cfg', presetFor(platform));
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('exports the game data as a pack while the editor is open, into a build folder the editor ignores', async () => {
    await tools().call('scene_open', { path: 'res://main.tscn' });
    await tools().call('node_set_properties', { path: '.', properties: { script: 'res://main.gd' } });
    await tools().call('scene_save');

    const exported = await tools().call('export_project', { mode: 'pack' });

    expect(exported.isError).toBe(false);
    expect(exported.text).toMatch(new RegExp(`^Exported the preset "${platform.name}" \\(${platform.name}, pack\\) to build/${platform.folder}/game\\.pck in [\\d.]+ s:\\n- game\\.pck \\([\\d.]+ (?:B|KB)\\)\\n`));
    expect(exported.text).toContain('Added a .gdignore file to build/, so the editor does not import the exported files.');
    expect(existsSync(scratch().path('build/.gdignore'))).toBe(true);

    const tree = await tools().call('scene_get_tree');

    expect(tree.isError).toBe(false);
  });

  it('runs the exported pack with the same Godot executable', () => {
    const output = execFileSync(godotBinary, ['--headless', '--main-pack', scratch().path(`build/${platform.folder}/game.pck`)], { encoding: 'utf8', timeout: 60_000 });

    expect(output).toContain('The exported game runs');
  });

  it('names the unsaved changes that a build would miss', async () => {
    await tools().call('node_add', { type: 'Node3D', name: 'Spawn' });

    const exported = await tools().call('export_project', { mode: 'pack' });

    expect(exported.text).toContain('Not in this build: unsaved changes in the editor to res://main.tscn. Save them (scene_save saves scenes) and export again.');
    await tools().call('scene_save');
  });

  it('builds a release with the export templates, or says how to get them when they are missing', async () => {
    const exported = await tools().call('export_project');

    if (exported.isError) {
      expect(exported.text).toMatch(/^The export of the preset ".+" \(.+, release\) failed:\n- Cannot export project with preset/);
      expect(exported.text).toMatch(/export templates/);
      expect(exported.text).toContain('mode: "pack" exports only the game data (.pck), which needs no export templates.');
    } else {
      expect(exported.text).toContain(`to build/${platform.folder}/${platform.file}`);
    }
  });

  it('refuses to write outside the project', async () => {
    const refused = await tools().call('export_project', { mode: 'pack', output: '../game.pck' });

    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('../game.pck is outside the project.');
  });
});
