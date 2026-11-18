import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EditorStatusProvider } from '../bridge/EditorConnection.js';
import { readConfigSections } from '../project/ConfigText.js';
import { ExportError } from './ExportError.js';
import { exportPlatformFacts, PresetNameTakenError, withExportPreset } from './ExportPresets.js';

export interface PresetRequest {
  readonly platform: string;
  readonly name?: string | undefined;
  readonly exportPath?: string | undefined;
}

export interface AddedPreset {
  readonly name: string;
  readonly platform: string;
  readonly exportPath: string;
  readonly editorRunning: boolean;
}

const presetsFileName = 'export_presets.cfg';
const projectFileName = 'project.godot';
const webPage = 'index.html';
const defaultGameFile = 'game';

export class ExportPresetWriter {
  constructor(
    private readonly projectRoot: string | undefined,
    private readonly editor: EditorStatusProvider,
  ) {}

  async add(request: PresetRequest): Promise<AddedPreset> {
    if (this.projectRoot === undefined) {
      throw new ExportError('No Godot project was found, so there is no export preset to add. Set GODOT_PROJECT_PATH to the folder with project.godot.');
    }
    const facts = exportPlatformFacts[request.platform];
    if (facts === undefined) {
      throw new ExportError(`Unknown platform "${request.platform}"; use one of: ${Object.keys(exportPlatformFacts).join(', ')}.`);
    }
    const name = request.name ?? request.platform;
    const exportPath = request.exportPath ?? `build/${facts.folder}/${request.platform === 'Web' ? webPage : `${gameFileName(this.projectRoot)}${facts.extension}`}`;
    const presetsFile = join(this.projectRoot, presetsFileName);
    const text = existsSync(presetsFile) ? readFileSync(presetsFile, 'utf8') : '';
    try {
      writeFileSync(presetsFile, withExportPreset(text, { name, platform: request.platform, exportPath }));
    } catch (error) {
      if (error instanceof PresetNameTakenError) {
        throw new ExportError(error.message, { cause: error });
      }
      throw error;
    }
    return { name, platform: request.platform, exportPath, editorRunning: (await this.editor.status()).connected };
  }
}

function gameFileName(projectRoot: string): string {
  const projectFile = join(projectRoot, projectFileName);
  const name = existsSync(projectFile)
    ? readConfigSections(readFileSync(projectFile, 'utf8'))
        .find((section) => section.name === 'application')
        ?.values.get('config/name')
    : undefined;
  const slug = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? defaultGameFile : slug;
}
