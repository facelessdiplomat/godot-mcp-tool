import { describe, expect, it } from 'vitest';
import { GodotBinaryLocator } from '../../src/godot/GodotBinaryLocator.js';

function createLocator(variables: Record<string, string>, executables: readonly string[], platform: NodeJS.Platform = 'darwin') {
  const executableFiles = new Set(executables);
  return new GodotBinaryLocator({
    variables,
    platform,
    homeDirectory: '/Users/dev',
    isExecutableFile: (path) => executableFiles.has(path),
  });
}

describe('GodotBinaryLocator', () => {
  it('prefers GODOT_BIN', () => {
    const locator = createLocator({ GODOT_BIN: '/opt/godot/godot', PATH: '/usr/bin' }, ['/opt/godot/godot', '/usr/bin/godot']);

    expect(locator.locate('/editor/godot')).toEqual({ found: true, path: '/opt/godot/godot', source: 'GODOT_BIN' });
  });

  it('reports a GODOT_BIN that is not an executable file', () => {
    const locator = createLocator({ GODOT_BIN: '/missing/godot' }, []);

    const lookup = locator.locate();

    expect(lookup.found).toBe(false);
    expect(!lookup.found && lookup.reason).toContain('/missing/godot');
  });

  it('falls back to the executable of the running editor', () => {
    const locator = createLocator({ PATH: '/usr/bin' }, ['/editor/godot', '/usr/bin/godot']);

    expect(locator.locate('/editor/godot')).toEqual({ found: true, path: '/editor/godot', source: 'running editor' });
  });

  it('searches PATH for godot and godot4', () => {
    const locator = createLocator({ PATH: '/usr/bin:/opt/godot' }, ['/opt/godot/godot4']);

    expect(locator.locate()).toEqual({ found: true, path: '/opt/godot/godot4', source: 'PATH' });
  });

  it('checks the default macOS application locations', () => {
    const locator = createLocator({}, ['/Users/dev/Applications/Godot.app/Contents/MacOS/Godot']);

    expect(locator.locate()).toEqual({
      found: true,
      path: '/Users/dev/Applications/Godot.app/Contents/MacOS/Godot',
      source: 'default location',
    });
  });

  it('looks for godot.exe on Windows', () => {
    const locator = createLocator({ PATH: 'C:\\Godot' }, ['C:\\Godot\\godot.exe'], 'win32');

    expect(locator.locate()).toEqual({ found: true, path: 'C:\\Godot\\godot.exe', source: 'PATH' });
  });

  it('explains how to configure the binary when nothing is found', () => {
    const lookup = createLocator({}, []).locate();

    expect(lookup.found).toBe(false);
    expect(!lookup.found && lookup.reason).toContain('GODOT_BIN');
  });
});
