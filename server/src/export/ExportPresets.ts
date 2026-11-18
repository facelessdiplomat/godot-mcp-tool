import { readConfigSections } from '../project/ConfigText.js';

export interface ExportPreset {
  readonly name: string;
  readonly platform: string;
  readonly exportPath: string;
}

export interface PlatformFacts {
  readonly folder: string;
  readonly exampleFile: string;
  readonly sconsPlatform: string;
  readonly extension: string;
}

export const exportPlatformFacts: Readonly<Record<string, PlatformFacts>> = {
  macOS: { folder: 'macos', exampleFile: 'game.zip', sconsPlatform: 'macos', extension: '.zip' },
  'Windows Desktop': { folder: 'windows', exampleFile: 'game.exe', sconsPlatform: 'windows', extension: '.exe' },
  Linux: { folder: 'linux', exampleFile: 'game.x86_64', sconsPlatform: 'linuxbsd', extension: '.x86_64' },
  Web: { folder: 'web', exampleFile: 'index.html', sconsPlatform: 'web', extension: '.html' },
  Android: { folder: 'android', exampleFile: 'game.apk', sconsPlatform: 'android', extension: '.apk' },
  iOS: { folder: 'ios', exampleFile: 'game.ipa', sconsPlatform: 'ios', extension: '.ipa' },
};

const presetSectionPattern = /^preset\.\d+$/;
const currentPlatformNames: Readonly<Record<string, string>> = { 'Linux/X11': 'Linux' };

export function readExportPresets(text: string): ExportPreset[] {
  return readConfigSections(text)
    .filter((section) => presetSectionPattern.test(section.name))
    .map((section) => {
      const platform = section.values.get('platform') ?? '';
      return {
        name: section.values.get('name') ?? '',
        platform: currentPlatformNames[platform] ?? platform,
        exportPath: section.values.get('export_path') ?? '',
      };
    });
}

export class PresetNameTakenError extends Error {
  override readonly name = 'PresetNameTakenError';
}

export function withExportPreset(text: string, preset: ExportPreset): string {
  const presets = readExportPresets(text);
  if (presets.some((existing) => existing.name === preset.name)) {
    throw new PresetNameTakenError(`A preset named "${preset.name}" exists already; give another name.`);
  }
  const runnable = !readConfigSections(text).some((section) => presetSectionPattern.test(section.name) && section.values.get('platform') === preset.platform && section.values.get('runnable') === 'true');
  const section = [
    `[preset.${String(presets.length)}]`,
    '',
    `name=${JSON.stringify(preset.name)}`,
    `platform=${JSON.stringify(preset.platform)}`,
    `runnable=${String(runnable)}`,
    'export_filter="all_resources"',
    'include_filter=""',
    'exclude_filter=""',
    `export_path=${JSON.stringify(preset.exportPath)}`,
    '',
  ];
  const existing = text.trimEnd();
  return existing === '' ? section.join('\n') : [existing, '', ...section].join('\n');
}
