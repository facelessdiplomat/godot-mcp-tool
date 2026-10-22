import { posix, win32 } from 'node:path';

export interface CacheDirectoryEnvironment {
  readonly platform: NodeJS.Platform;
  readonly homeDirectory: string;
  readonly variables: Readonly<Record<string, string | undefined>>;
}

const applicationFolder = 'godot-mcp-tool';

export function userCacheDirectory(environment: CacheDirectoryEnvironment): string {
  const { platform, homeDirectory, variables } = environment;
  const configured = variables['GODOT_MCP_CACHE_DIR'];
  if (configured !== undefined && configured !== '') {
    return configured;
  }
  if (platform === 'win32') {
    return win32.join(nonEmpty(variables['LOCALAPPDATA']) ?? win32.join(homeDirectory, 'AppData', 'Local'), applicationFolder, 'Cache');
  }
  if (platform === 'darwin') {
    return posix.join(homeDirectory, 'Library', 'Caches', applicationFolder);
  }
  return posix.join(nonEmpty(variables['XDG_CACHE_HOME']) ?? posix.join(homeDirectory, '.cache'), applicationFolder);
}

function nonEmpty(text: string | undefined): string | undefined {
  return text === undefined || text === '' ? undefined : text;
}
