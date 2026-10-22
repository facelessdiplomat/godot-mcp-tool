import { readConfigSections } from '../project/ConfigText.js';

export interface ExportPreset {
  readonly name: string;
  readonly platform: string;
  readonly exportPath: string;
}

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
