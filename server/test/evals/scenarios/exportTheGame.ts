import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { exportPresetsFor, hostExportPlatform, type TemporaryProject } from '../../integration/harness.js';
import { checked, type Scenario } from '../Scenario.js';

const platform = hostExportPlatform ?? { name: 'macOS', folder: 'macos', file: 'game.zip' };
const mainScene = 'res://main.tscn';
const ignoreFileName = '.gdignore';
const admitsNoBuild = /\b(couldn't|could not|can't|cannot|wasn't able|was not able|unable|failed|didn't|did not)\b/i;

export const exportTheGame: Scenario = {
  name: 'export-the-game',
  request: 'Make a build of the game for this Mac that I can send to a friend.',
  projectOptions: { mainScene },
  async prepare({ project, tools }) {
    project.write('export_presets.cfg', exportPresetsFor(platform));
    await tools.call('scene_create', { path: mainScene, root_type: 'Node3D' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [10, 1, 10], position: [0, -0.5, 0] } },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 3, 8] } },
      ],
    });
    await tools.call('scene_save');
    await tools.call('node_add', { type: 'DirectionalLight3D', name: 'Sun' });
  },
  async solve({ tools }) {
    await tools.call('scene_save');
    await tools.call('export_project', {});
    await tools.call('export_project', { mode: 'pack' });
  },
  check({ project, agent }) {
    const build = `build/${platform.folder}/${platform.file}`;
    const built = existsSync(project.path(build));
    const exported = exportedFiles(project);
    const checks = exported.length > 0 ? [checked('the unsaved change went into the export', project.read('main.tscn').includes('name="Sun"'), exported.join(', '))] : [];
    if (agent === undefined) {
      return Promise.resolve(checks);
    }
    const message = agent.finalMessage;
    if (built) {
      checks.push(checked('the agent points to the build', message.includes(platform.file), build));
    } else {
      checks.push(
        checked('the agent says that it could not make the build', admitsNoBuild.test(message), message.split('\n')[0] ?? ''),
        checked('the agent says which export templates are missing and how to get them', /template/i.test(message), message.slice(0, 200)),
        checked('the agent offers a data-only pack', /\.pck|pack/i.test(message), message.slice(0, 200)),
      );
    }
    return Promise.resolve(checks);
  },
};

function exportedFiles(project: TemporaryProject): string[] {
  return readdirSync(project.root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && existsSync(join(project.root, entry.name, ignoreFileName)))
    .flatMap((folder) => readdirSync(join(project.root, folder.name), { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== ignoreFileName)
    .map((entry) => relative(project.root, join(entry.parentPath, entry.name)));
}
