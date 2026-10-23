import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const publishedPackageCommand = /npx -y godot-mcp-tool@\S+/g;

export function stagePlugin(pluginDirectory: string, destination: string, cliPath: string): void {
  cpSync(pluginDirectory, destination, { recursive: true });
  rmSync(join(destination, '.mcp.json'), { force: true });
  const hooksFile = join(destination, 'hooks', 'hooks.json');
  const hooks = JSON.parse(readFileSync(hooksFile, 'utf8')) as unknown;
  writeFileSync(hooksFile, `${JSON.stringify(withLocalCli(hooks, cliPath), null, 2)}\n`);
}

function withLocalCli(value: unknown, cliPath: string): unknown {
  if (typeof value === 'string') {
    return value.replace(publishedPackageCommand, `node "${cliPath}"`);
  }
  if (Array.isArray(value)) {
    return value.map((item) => withLocalCli(item, cliPath));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withLocalCli(item, cliPath)]));
  }
  return value;
}
