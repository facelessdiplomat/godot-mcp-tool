import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { ExportError } from '../export/ExportError.js';
import type { ExportRequest, ExportResult } from '../export/ProjectExporter.js';
import { changingAnnotations } from './annotations.js';
import { errorResult, textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

export interface ExportService {
  export(request: ExportRequest): Promise<ExportResult>;
}

const exportProjectInput = z.object({
  preset: z
    .string()
    .min(1)
    .optional()
    .describe('The export preset, by its name in Project → Export, such as "macOS" or "Windows Desktop". Default: the only preset of the project.'),
  mode: z
    .enum(['release', 'debug', 'pack'])
    .default('release')
    .describe(
      '"release" or "debug" builds the game with the export templates of the platform; "pack" writes only the game data as a .pck or .zip file, which needs no export templates and runs with a Godot executable of the same version. Default: "release".',
    ),
  output: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Where to write the export, with the file name, inside the project folder, such as "build/macos/game.zip"; the extension picks the format. Default: the export path of the preset, ending in .pck in mode "pack".',
    ),
  timeout_ms: z.number().int().min(10_000).max(3_600_000).default(600_000).describe('Stop the export after this many milliseconds.'),
});

const bytesPerKilobyte = 1024;
const sizeUnits = ['KB', 'MB', 'GB'];

export class ExportProjectTool implements Tool<typeof exportProjectInput> {
  readonly name = 'export_project';

  readonly definition: ToolDefinition<typeof exportProjectInput> = {
    title: 'Export the game',
    description:
      'Export the game with an export preset of the project, as Project → Export does, in a separate Godot process: a release or debug build, or only the game data as a .pck. The result lists the written files with their sizes and the warnings of the export. It writes only into a folder of its own inside the project, such as build/, which gets a .gdignore file so the editor does not import the exported files. Scenes and scripts are read from disk, so save changes first with scene_save. Release and debug builds need the export templates of the platform; when they are missing, the result says how to get them. Works without the editor.',
    inputSchema: exportProjectInput,
    annotations: changingAnnotations({ destructive: false, idempotent: true }),
    alwaysLoad: false,
  };

  constructor(private readonly exporter: ExportService) {}

  async execute(input: z.input<typeof exportProjectInput>): Promise<CallToolResult> {
    const parsedInput = exportProjectInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    const { preset, mode, output, timeout_ms: timeoutMs } = parsedInput.data;
    try {
      const result = await this.exporter.export({ ...(preset === undefined ? {} : { preset }), mode, ...(output === undefined ? {} : { output }), timeoutMs });
      return textResult(describeExport(result));
    } catch (error) {
      if (error instanceof ExportError) {
        return errorResult(error.message);
      }
      throw error;
    }
  }
}

function describeExport(result: ExportResult): string {
  const seconds = (result.durationMs / 1000).toFixed(1);
  return [
    `Exported the preset "${result.preset.name}" (${result.preset.platform}, ${result.mode}) to ${result.output} in ${seconds} s:`,
    ...result.files.map((file) => `- ${file.name} (${sizeText(file.bytes)})`),
    ...(result.warnings.length === 0 ? [] : ['Warnings:', ...result.warnings.map((warning) => `- ${warning}`)]),
    ...(result.ignoredFolder === undefined ? [] : [`Added a .gdignore file to ${result.ignoredFolder}/, so the editor does not import the exported files.`]),
    ...(result.unsavedFiles.length === 0
      ? []
      : [`Not in this build: unsaved changes in the editor to ${result.unsavedFiles.join(', ')}. Save them (scene_save saves scenes) and export again.`]),
  ].join('\n');
}

function sizeText(bytes: number): string {
  if (bytes < bytesPerKilobyte) {
    return `${String(bytes)} B`;
  }
  let value = bytes / bytesPerKilobyte;
  let unitIndex = 0;
  while (value >= bytesPerKilobyte && unitIndex < sizeUnits.length - 1) {
    value /= bytesPerKilobyte;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${sizeUnits[unitIndex] ?? ''}`;
}
