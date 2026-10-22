import { describe, expect, it } from 'vitest';
import { userCacheDirectory } from '../../src/util/CacheDirectory.js';

describe('userCacheDirectory', () => {
  it('uses the folder named in GODOT_MCP_CACHE_DIR', () => {
    expect(userCacheDirectory({ platform: 'darwin', homeDirectory: '/Users/ada', variables: { GODOT_MCP_CACHE_DIR: '/tmp/cache' } })).toBe('/tmp/cache');
  });

  it('uses the caches folder of macOS', () => {
    expect(userCacheDirectory({ platform: 'darwin', homeDirectory: '/Users/ada', variables: {} })).toBe('/Users/ada/Library/Caches/godot-mcp-tool');
  });

  it('follows XDG_CACHE_HOME on Linux', () => {
    expect(userCacheDirectory({ platform: 'linux', homeDirectory: '/home/ada', variables: {} })).toBe('/home/ada/.cache/godot-mcp-tool');
    expect(userCacheDirectory({ platform: 'linux', homeDirectory: '/home/ada', variables: { XDG_CACHE_HOME: '/var/cache/ada' } })).toBe('/var/cache/ada/godot-mcp-tool');
  });

  it('uses the local application data of Windows', () => {
    expect(userCacheDirectory({ platform: 'win32', homeDirectory: 'C:\\Users\\Ada', variables: { LOCALAPPDATA: 'C:\\Users\\Ada\\AppData\\Local' } })).toBe(
      'C:\\Users\\Ada\\AppData\\Local\\godot-mcp-tool\\Cache',
    );
  });
});
