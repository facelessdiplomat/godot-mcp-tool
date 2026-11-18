import { existsSync } from 'node:fs';
import { type ExportPreset, readExportPresets } from '../../../src/export/ExportPresets.js';
import type { TemporaryProject } from '../../integration/harness.js';
import { agentUsed, type CheckResult, checked, type Scenario } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena } from './fixtures.js';

const platforms = ['Windows Desktop', 'Linux'] as const;
const buildsFolder = 'builds/';

function presetsOf(project: TemporaryProject): ExportPreset[] {
  return existsSync(project.path('export_presets.cfg')) ? readExportPresets(project.read('export_presets.cfg')) : [];
}

function exportsIntoTheBuildsFolder(preset: ExportPreset): boolean {
  return preset.exportPath.replace(/^res:\/\//, '').startsWith(buildsFolder);
}

function describePresets(presets: readonly ExportPreset[]): string {
  return presets.length === 0 ? 'export_presets.cfg has no presets' : presets.map((preset) => `${preset.name} (${preset.platform}) → ${preset.exportPath}`).join('; ');
}

export const exportsForWindowsAndLinux: Scenario = {
  name: 'exports-for-windows-and-linux',
  request: 'Set up exports of the game for Windows and Linux, with the builds going into the builds folder of the project.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ tools }) {
    await buildArena(tools, arenaOperations());
  },
  async solve({ tools }) {
    await tools.call('export_preset_add', { platform: 'Windows Desktop', export_path: 'builds/windows/arena.exe' });
    await tools.call('export_preset_add', { platform: 'Linux', export_path: 'builds/linux/arena.x86_64' });
  },
  async check({ project, tools, agent }) {
    const presets = presetsOf(project);
    const checks: CheckResult[] = [];
    for (const platform of platforms) {
      const preset = presets.find((candidate) => candidate.platform === platform && exportsIntoTheBuildsFolder(candidate));
      checks.push(checked(`a ${platform} preset exports into the builds folder`, preset !== undefined, preset === undefined ? describePresets(presets) : `${preset.name} → ${preset.exportPath}`));
      if (preset !== undefined) {
        const exported = await tools.call('export_project', { preset: preset.name, mode: 'pack' });
        checks.push(checked(`the ${platform} preset exports the game data`, !exported.isError, exported.text.split('\n')[0] ?? ''));
      }
    }
    checks.push(...agentUsed(agent, ['export_preset_add'], 'the agent added the presets with export_preset_add'));
    return checks;
  },
};
