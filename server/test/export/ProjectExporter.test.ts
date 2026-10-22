import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorStatus } from '../../src/bridge/EditorConnection.js';
import { ExportError } from '../../src/export/ExportError.js';
import { type ExportRequest, ProjectExporter, type ProjectExporterDependencies } from '../../src/export/ProjectExporter.js';
import { GodotVersion } from '../../src/godot/GodotVersion.js';
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from '../../src/process/ProcessRunner.js';

interface RecordedRun {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: ProcessRunOptions;
}

class FakeExportRunner implements ProcessRunner {
  readonly runs: RecordedRun[] = [];
  writtenFiles: Readonly<Record<string, number>> = { 'game.zip': 2048 };
  exitCode = 0;
  errorOutput = '';
  failure: Error | undefined;

  run(command: string, args: readonly string[], options: ProcessRunOptions): Promise<ProcessResult> {
    this.runs.push({ command, args, options });
    if (this.failure !== undefined) {
      return Promise.reject(this.failure);
    }
    const outputFolder = dirname(args.at(-1) ?? '');
    for (const [name, bytes] of Object.entries(this.writtenFiles)) {
      writeFileSync(join(outputFolder, name), Buffer.alloc(bytes));
    }
    return Promise.resolve({ exitCode: this.exitCode, stdout: '', stderr: this.errorOutput });
  }
}

const presets = (...entries: readonly (readonly [string, string, string])[]): string =>
  entries.flatMap(([name, platform, exportPath], index) => [`[preset.${String(index)}]`, '', `name="${name}"`, `platform="${platform}"`, `export_path="${exportPath}"`, '']).join('\n');

const connected: EditorStatus = {
  connected: true,
  hello: { protocol: 1, godotVersion: '4.8', addonVersion: '0.1.0', projectPath: '/game', executablePath: '/opt/godot', methods: [] },
};
const notConnected: EditorStatus = { connected: false, reason: 'The Godot editor is not running for this project.' };

const missingTemplateOutput = [
  'ERROR: Cannot export project with preset "macOS" due to configuration errors:',
  'No export template found at the expected path:',
  '/Users/me/Library/Application Support/Godot/export_templates/4.8.beta/macos.zip',
  '   at: _fs_changed (editor/editor_node.cpp:1471)',
  'ERROR: Project export for preset "macOS" failed.',
  '   at: _fs_changed (editor/editor_node.cpp:1487)',
].join('\n');

describe('ProjectExporter', () => {
  let projectRoot = '';
  let runner: FakeExportRunner;
  let editorStatus: EditorStatus;
  let unsavedFiles: unknown;
  let godotVersion: string;
  let clockMs: number;

  function exporter(overrides: Partial<ProjectExporterDependencies> = {}): ProjectExporter {
    return new ProjectExporter({
      projectRoot,
      editor: {
        status: () => Promise.resolve(editorStatus),
        request: () => Promise.resolve(unsavedFiles),
      },
      locateBinary: () => Promise.resolve({ found: true, path: '/opt/godot', source: 'GODOT_BIN' }),
      processRunner: runner,
      readVersion: () => Promise.resolve(GodotVersion.parse(godotVersion)),
      now: () => (clockMs += 2100),
      ...overrides,
    });
  }

  function request(overrides: Partial<ExportRequest> = {}): ExportRequest {
    return { mode: 'release', timeoutMs: 600_000, ...overrides };
  }

  async function refusal(exportRequest: ExportRequest): Promise<string> {
    try {
      await exporter().export(exportRequest);
    } catch (error) {
      if (error instanceof ExportError) {
        return error.message;
      }
      throw error;
    }
    throw new Error('The export was not refused');
  }

  function writePresets(text: string): void {
    writeFileSync(join(projectRoot, 'export_presets.cfg'), text);
  }

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'project-exporter-')));
    writeFileSync(join(projectRoot, 'project.godot'), '');
    writePresets(presets(['macOS', 'macOS', 'build/macos/game.zip']));
    runner = new FakeExportRunner();
    editorStatus = notConnected;
    unsavedFiles = { scenes: [], scripts: [] };
    godotVersion = '4.8.stable.official.abc1234';
    clockMs = 0;
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('exports the only preset to its export path and lists the files it wrote', async () => {
    const result = await exporter().export(request());

    expect(runner.runs[0]).toEqual({
      command: '/opt/godot',
      args: ['--headless', '--quiet', '--path', projectRoot, '--export-release', 'macOS', join(projectRoot, 'build', 'macos', 'game.zip')],
      options: { timeoutMs: 600_000, cwd: projectRoot },
    });
    expect(result).toEqual({
      preset: { name: 'macOS', platform: 'macOS', exportPath: 'build/macos/game.zip' },
      mode: 'release',
      output: 'build/macos/game.zip',
      files: [{ name: 'game.zip', bytes: 2048 }],
      warnings: [],
      unsavedFiles: [],
      ignoredFolder: 'build',
      durationMs: 2100,
    });
    expect(existsSync(join(projectRoot, 'build', '.gdignore'))).toBe(true);
  });

  it('exports only the game data in pack mode, next to the export path of the preset', async () => {
    runner.writtenFiles = { 'game.pck': 512 };

    const result = await exporter().export(request({ mode: 'pack' }));

    expect(runner.runs[0]?.args.slice(4)).toEqual(['--export-pack', 'macOS', join(projectRoot, 'build', 'macos', 'game.pck')]);
    expect(result.output).toBe('build/macos/game.pck');
  });

  it('exports a debug build of the chosen preset to the given output and lists every file it wrote', async () => {
    writePresets(presets(['macOS', 'macOS', 'build/macos/game.zip'], ['Linux', 'Linux', 'build/linux/game.x86_64']));
    mkdirSync(join(projectRoot, 'build', 'linux'), { recursive: true });
    writeFileSync(join(projectRoot, 'build', '.gdignore'), '');
    writeFileSync(join(projectRoot, 'build', 'linux', 'notes.txt'), 'kept');
    runner.writtenFiles = { 'space.x86_64': 4096, 'space.pck': 1024 };

    const result = await exporter().export(request({ preset: 'Linux', mode: 'debug', output: 'res://build/linux/space.x86_64' }));

    expect(runner.runs[0]?.args.slice(4)).toEqual(['--export-debug', 'Linux', join(projectRoot, 'build', 'linux', 'space.x86_64')]);
    expect(result.files).toEqual([
      { name: 'space.pck', bytes: 1024 },
      { name: 'space.x86_64', bytes: 4096 },
    ]);
    expect(result.ignoredFolder).toBeUndefined();
  });

  it('names the unsaved changes in the editor, which the export does not see', async () => {
    editorStatus = connected;
    unsavedFiles = { scenes: ['res://level.tscn'], scripts: ['res://player.gd'] };

    const result = await exporter().export(request());

    expect(result.unsavedFiles).toEqual(['res://level.tscn', 'res://player.gd']);
  });

  it('asks which preset to export when the project has several, and explains unknown ones', async () => {
    writePresets(presets(['macOS', 'macOS', 'build/macos/game.zip'], ['Web', 'Web', 'build/web/index.html']));

    expect(await refusal(request())).toBe('This project has 2 export presets; pass preset with one of them: "macOS" (macOS), "Web" (Web).');
    expect(await refusal(request({ preset: 'Linux' }))).toBe('There is no export preset "Linux" in this project. Its presets: "macOS" (macOS), "Web" (Web).');
    expect(runner.runs).toEqual([]);
  });

  it('explains a project without export presets and a preset without an export path', async () => {
    rmSync(join(projectRoot, 'export_presets.cfg'));
    const withoutPresets = await refusal(request());
    writePresets(presets(['Windows', 'Windows Desktop', '']));
    const withoutPath = await refusal(request());

    expect(withoutPresets).toBe(
      'This project has no export presets yet (no export_presets.cfg). Ask the user to add one in Project → Export in the editor, which can also install the export templates.',
    );
    expect(withoutPath).toBe('The preset "Windows" has no export path; pass output, such as "build/windows/game.exe".');
  });

  it('refuses an export path outside the project', async () => {
    writePresets(presets(['macOS', 'macOS', '../builds/game.zip']));

    expect(await refusal(request())).toContain('../builds/game.zip is outside the project');
    expect(runner.runs).toEqual([]);
  });

  it('explains how to get the export templates of an official build when they are missing', async () => {
    runner.exitCode = 1;
    runner.writtenFiles = {};
    runner.errorOutput = missingTemplateOutput;

    expect(await refusal(request())).toBe(
      [
        'The export of the preset "macOS" (macOS, release) failed:',
        '- Cannot export project with preset "macOS" due to configuration errors: No export template found at the expected path: /Users/me/Library/Application Support/Godot/export_templates/4.8.beta/macos.zip',
        'The export templates of this Godot version are not installed: ask the user to install them in the editor with Editor → Manage Export Templates → Download and Install. mode: "pack" exports only the game data (.pck), which needs no export templates.',
      ].join('\n'),
    );
  });

  it('explains that a custom build of Godot needs export templates built from the same source', async () => {
    runner.exitCode = 1;
    runner.writtenFiles = {};
    runner.errorOutput = missingTemplateOutput;
    godotVersion = '4.8.beta.custom_build.679066724';

    const message = await refusal(request());

    expect(message).toContain(
      'This Godot is a custom build (4.8.beta.custom_build.679066724), which has no official export templates: build them from the same source with scons platform=macos target=template_release (see "Compiling" in the Godot documentation), then save the template at /Users/me/Library/Application Support/Godot/export_templates/4.8.beta/macos.zip, or set custom_template/release in the preset to it.',
    );
  });

  it('fails when Godot reports success but wrote nothing, and when it does not finish in time', async () => {
    runner.writtenFiles = {};
    const silent = await refusal(request());
    runner.failure = new Error('/opt/godot did not finish within 600000 ms');
    const late = await refusal(request());

    expect(silent).toBe('The export of the preset "macOS" (macOS, release) finished without writing build/macos/game.zip.');
    expect(late).toBe('The export of the preset "macOS" did not finish within 600 s; raise timeout_ms.');
  });
});
