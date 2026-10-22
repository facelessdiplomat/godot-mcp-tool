import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as z from 'zod/v4';
import type { EditorStatusProvider } from '../bridge/EditorConnection.js';
import type { EditorGateway } from '../editor/EditorGateway.js';
import type { BinaryLookup } from '../godot/GodotBinaryLocator.js';
import type { GodotVersion } from '../godot/GodotVersion.js';
import type { ProcessResult, ProcessRunner } from '../process/ProcessRunner.js';
import { ExportDestination } from './ExportDestination.js';
import { ExportError } from './ExportError.js';
import { type ExportOutput, readExportOutput } from './ExportOutput.js';
import { type ExportPreset, readExportPresets } from './ExportPresets.js';

export type ExportMode = 'release' | 'debug' | 'pack';

export interface ExportRequest {
  readonly preset?: string | undefined;
  readonly mode: ExportMode;
  readonly output?: string | undefined;
  readonly timeoutMs: number;
}

export interface ExportedFile {
  readonly name: string;
  readonly bytes: number;
}

export interface ExportResult {
  readonly preset: ExportPreset;
  readonly mode: ExportMode;
  readonly output: string;
  readonly files: readonly ExportedFile[];
  readonly warnings: readonly string[];
  readonly unsavedFiles: readonly string[];
  readonly ignoredFolder: string | undefined;
  readonly durationMs: number;
}

export interface ProjectExporterDependencies {
  readonly projectRoot: string | undefined;
  readonly editor: EditorStatusProvider & EditorGateway;
  readonly locateBinary: () => Promise<BinaryLookup>;
  readonly processRunner: ProcessRunner;
  readonly readVersion: (executablePath: string) => Promise<GodotVersion>;
  readonly now: () => number;
}

interface PlatformFacts {
  readonly folder: string;
  readonly exampleFile: string;
  readonly sconsPlatform: string;
}

const presetsFileName = 'export_presets.cfg';
const ignoreFileName = '.gdignore';
const packExtension = '.pck';
const officialBuild = 'official';
const unsavedFilesTimeoutMs = 5_000;
const modeArguments: Readonly<Record<ExportMode, string>> = { release: '--export-release', debug: '--export-debug', pack: '--export-pack' };
const platformFacts: Readonly<Record<string, PlatformFacts>> = {
  macOS: { folder: 'macos', exampleFile: 'game.zip', sconsPlatform: 'macos' },
  'Windows Desktop': { folder: 'windows', exampleFile: 'game.exe', sconsPlatform: 'windows' },
  Linux: { folder: 'linux', exampleFile: 'game.x86_64', sconsPlatform: 'linuxbsd' },
  Web: { folder: 'web', exampleFile: 'index.html', sconsPlatform: 'web' },
  Android: { folder: 'android', exampleFile: 'game.apk', sconsPlatform: 'android' },
  iOS: { folder: 'ios', exampleFile: 'game.ipa', sconsPlatform: 'ios' },
};
const unsavedFilesSchema = z.object({ scenes: z.array(z.string()), scripts: z.array(z.string()) });

export class ProjectExporter {
  constructor(private readonly dependencies: ProjectExporterDependencies) {}

  async export(request: ExportRequest): Promise<ExportResult> {
    const { projectRoot } = this.dependencies;
    if (projectRoot === undefined) {
      throw new ExportError('No Godot project was found, so there is nothing to export. Set GODOT_PROJECT_PATH to the folder with project.godot.');
    }
    const preset = choosePreset(readPresets(projectRoot), request.preset);
    const destination = ExportDestination.resolve(projectRoot, outputPathFor(preset, request));
    const binary = await this.dependencies.locateBinary();
    if (!binary.found) {
      throw new ExportError(binary.reason);
    }
    const unsavedFiles = await this.unsavedFiles();
    destination.prepare();
    const entriesBefore = entryTimes(destination.folder);
    const startedAt = this.dependencies.now();
    const result = await this.runExport(binary.path, projectRoot, preset, request, destination);
    const durationMs = this.dependencies.now() - startedAt;
    const output = readExportOutput(`${result.stdout}\n${result.stderr}`);
    const files = changedEntries(destination.folder, entriesBefore);
    const heading = `The export of the preset "${preset.name}" (${preset.platform}, ${request.mode})`;
    if (result.exitCode !== 0) {
      const hint = output.missingTemplates ? templatesHint(preset, request.mode, output, await this.versionOf(binary.path)) : undefined;
      throw new ExportError([`${heading} failed:`, ...describeErrors(output, result), ...(hint === undefined ? [] : [hint])].join('\n'));
    }
    if (!files.some((file) => file.name === basename(destination.absolutePath))) {
      throw new ExportError(`${heading} finished without writing ${destination.relativePath}.`);
    }
    return {
      preset,
      mode: request.mode,
      output: destination.relativePath,
      files,
      warnings: output.warnings,
      unsavedFiles,
      ignoredFolder: destination.ignoredFolder,
      durationMs,
    };
  }

  private async runExport(binaryPath: string, projectRoot: string, preset: ExportPreset, request: ExportRequest, destination: ExportDestination): Promise<ProcessResult> {
    const args = ['--headless', '--quiet', '--path', projectRoot, modeArguments[request.mode], preset.name, destination.absolutePath];
    try {
      return await this.dependencies.processRunner.run(binaryPath, args, { timeoutMs: request.timeoutMs, cwd: projectRoot });
    } catch (error) {
      if (error instanceof Error && error.message.includes('did not finish within')) {
        throw new ExportError(`The export of the preset "${preset.name}" did not finish within ${String(Math.round(request.timeoutMs / 1000))} s; raise timeout_ms.`, { cause: error });
      }
      throw error;
    }
  }

  private async unsavedFiles(): Promise<string[]> {
    const editorStatus = await this.dependencies.editor.status();
    if (!editorStatus.connected) {
      return [];
    }
    try {
      const unsaved = unsavedFilesSchema.parse(await this.dependencies.editor.request('editor.unsaved_files', {}, { timeoutMs: unsavedFilesTimeoutMs }));
      return [...unsaved.scenes, ...unsaved.scripts];
    } catch {
      return [];
    }
  }

  private async versionOf(executablePath: string): Promise<GodotVersion | undefined> {
    try {
      return await this.dependencies.readVersion(executablePath);
    } catch {
      return undefined;
    }
  }
}

function readPresets(projectRoot: string): ExportPreset[] {
  const presetsFile = join(projectRoot, presetsFileName);
  const presets = existsSync(presetsFile) ? readExportPresets(readFileSync(presetsFile, 'utf8')) : [];
  if (presets.length === 0) {
    throw new ExportError(
      `This project has no export presets yet (no ${presetsFileName}). Ask the user to add one in Project → Export in the editor, which can also install the export templates.`,
    );
  }
  return presets;
}

function choosePreset(presets: readonly ExportPreset[], requestedName: string | undefined): ExportPreset {
  const presetList = presets.map((preset) => `"${preset.name}" (${preset.platform})`).join(', ');
  if (requestedName === undefined) {
    const [onlyPreset] = presets;
    if (presets.length === 1 && onlyPreset !== undefined) {
      return onlyPreset;
    }
    throw new ExportError(`This project has ${String(presets.length)} export presets; pass preset with one of them: ${presetList}.`);
  }
  const preset = presets.find((candidate) => candidate.name === requestedName);
  if (preset === undefined) {
    throw new ExportError(`There is no export preset "${requestedName}" in this project. Its presets: ${presetList}.`);
  }
  return preset;
}

function outputPathFor(preset: ExportPreset, request: ExportRequest): string {
  if (request.output !== undefined) {
    return request.output;
  }
  const facts = factsOf(preset.platform);
  if (preset.exportPath === '') {
    const example = `build/${facts.folder}/${request.mode === 'pack' ? `game${packExtension}` : facts.exampleFile}`;
    throw new ExportError(`The preset "${preset.name}" has no export path; pass output, such as "${example}".`);
  }
  return request.mode === 'pack' ? preset.exportPath.replace(/\.[^./\\]*$/, '') + packExtension : preset.exportPath;
}

function factsOf(platform: string): PlatformFacts {
  const name = platform.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return platformFacts[platform] ?? { folder: name, exampleFile: 'game.zip', sconsPlatform: name };
}

function describeErrors(output: ExportOutput, result: ProcessResult): string[] {
  if (output.errors.length === 0) {
    return [`- Godot exited with code ${String(result.exitCode)} without an error message.`];
  }
  return output.errors.map((error) => `- ${error}`);
}

function templatesHint(preset: ExportPreset, mode: ExportMode, output: ExportOutput, version: GodotVersion | undefined): string {
  const packAlternative = 'mode: "pack" exports only the game data (.pck), which needs no export templates.';
  if (version === undefined || version.build === officialBuild) {
    return `The export templates of this Godot version are not installed: ask the user to install them in the editor with Editor → Manage Export Templates → Download and Install. ${packAlternative}`;
  }
  const kind = mode === 'debug' ? 'debug' : 'release';
  const destination = output.expectedTemplatePath === undefined ? '' : `save the template at ${output.expectedTemplatePath}, or `;
  return `This Godot is a custom build (${version.toString()}), which has no official export templates: build them from the same source with scons platform=${factsOf(preset.platform).sconsPlatform} target=template_${kind} (see "Compiling" in the Godot documentation), then ${destination}set custom_template/${kind} in the preset to it. ${packAlternative}`;
}

function entryTimes(folder: string): Map<string, number> {
  return new Map(readdirSync(folder).map((name) => [name, lstatSync(join(folder, name)).mtimeMs]));
}

function changedEntries(folder: string, entriesBefore: ReadonlyMap<string, number>): ExportedFile[] {
  return readdirSync(folder)
    .filter((name) => name !== ignoreFileName && entriesBefore.get(name) !== lstatSync(join(folder, name)).mtimeMs)
    .sort((first, second) => first.localeCompare(second))
    .map((name) => ({ name, bytes: sizeOf(join(folder, name)) }));
}

function sizeOf(path: string): number {
  const entry = lstatSync(path);
  if (!entry.isDirectory()) {
    return entry.size;
  }
  return readdirSync(path).reduce((total, name) => total + sizeOf(join(path, name)), 0);
}
