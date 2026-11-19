import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const addonPath = 'addon/addons/godot_mcp_tool';

export function packAssetStoreArchive({ repositoryRoot, commit, outputDirectory }) {
  const pluginConfig = execFileSync('git', ['show', `${commit}:${addonPath}/plugin.cfg`], { cwd: repositoryRoot, encoding: 'utf8' });
  const version = /^version="(?<version>[^"]+)"$/m.exec(pluginConfig)?.groups?.version;
  if (version === undefined) {
    throw new Error(`${addonPath}/plugin.cfg at ${commit} has no version`);
  }
  mkdirSync(outputDirectory, { recursive: true });
  const archive = join(outputDirectory, `godot-mcp-tool-${version}-asset-store.zip`);
  execFileSync('git', ['archive', '--format=zip', `--output=${archive}`, `${commit}:addon`, 'addons/godot_mcp_tool'], { cwd: repositoryRoot });
  return archive;
}
