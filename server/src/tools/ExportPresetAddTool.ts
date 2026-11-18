import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { ExportError } from '../export/ExportError.js';
import type { AddedPreset, PresetRequest } from '../export/ExportPresetWriter.js';
import { changingAnnotations } from './annotations.js';
import { errorResult, textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

export interface PresetAdder {
  add(request: PresetRequest): Promise<AddedPreset>;
}

const exportPresetAddInput = z.object({
  platform: z.enum(['Windows Desktop', 'Linux', 'macOS', 'Web', 'Android', 'iOS']).describe('The platform to export to, as Project → Export names it.'),
  name: z.string().min(1).optional().describe('The name of the preset, which export_project takes. Default: the platform name.'),
  export_path: z
    .string()
    .min(1)
    .optional()
    .describe('Where the export goes, inside the project folder, such as "build/linux/capsule-walk.x86_64". Default: build/<platform>/ with the game name and the extension of the platform.'),
});

export class ExportPresetAddTool implements Tool<typeof exportPresetAddInput> {
  readonly name = 'export_preset_add';

  readonly definition: ToolDefinition<typeof exportPresetAddInput> = {
    title: 'Add export preset',
    description:
      'Add an export preset for a platform to export_presets.cfg, with the default options of that platform, so that export_project can export the game; mode "pack" of export_project needs no export templates. The editor reads presets when it starts, so its Export dialog shows a preset added while it runs only after a restart.',
    inputSchema: exportPresetAddInput,
    annotations: changingAnnotations({ destructive: false, idempotent: false }),
    alwaysLoad: false,
  };

  constructor(private readonly presets: PresetAdder) {}

  async execute(input: z.input<typeof exportPresetAddInput>): Promise<CallToolResult> {
    const parsedInput = exportPresetAddInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    let added: AddedPreset;
    try {
      added = await this.presets.add({ platform: parsedInput.data.platform, name: parsedInput.data.name, exportPath: parsedInput.data.export_path });
    } catch (error) {
      if (error instanceof ExportError) {
        return errorResult(error.message);
      }
      throw error;
    }
    return textResult(
      [
        `Added the export preset "${added.name}" (${added.platform}) to export_presets.cfg, exporting to ${added.exportPath}. Export with export_project; its mode "pack" needs no export templates.`,
        ...(added.editorRunning
          ? ["The running editor read its presets when it started: its Export dialog shows this one after a restart, and saving presets in that dialog before then writes the editor's list over export_presets.cfg."]
          : []),
      ].join('\n'),
    );
  }
}
