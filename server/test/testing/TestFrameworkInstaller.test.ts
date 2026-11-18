import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SwitchedPlugin } from '../../src/addon/PluginSwitch.js';
import type { ProcessResult, ProcessRunner } from '../../src/process/ProcessRunner.js';
import { TestFrameworkInstallError, TestFrameworkInstaller } from '../../src/testing/TestFrameworkInstaller.js';

const gutCommit = 'aeb5d4f3f7f0a6c9b5e178876d6c99b791fda605';

class FakeGit implements ProcessRunner {
  readonly commands: string[][] = [];

  constructor(private readonly head: string) {}

  run(command: string, args: readonly string[]): Promise<ProcessResult> {
    this.commands.push([command, ...args]);
    if (command === 'git' && args.includes('rev-parse')) {
      return Promise.resolve({ exitCode: 0, stdout: `${this.head}\n`, stderr: '' });
    }
    if (command === 'tar') {
      const unpacked = args[args.indexOf('-C') + 1] ?? '';
      mkdirSync(join(unpacked, 'addons', 'gut'), { recursive: true });
      writeFileSync(join(unpacked, 'addons', 'gut', 'plugin.cfg'), '[plugin]\nname="Gut"\n');
    }
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
  }
}

describe('installing a test framework', () => {
  let projectRoot: string;
  let switched: [string, boolean][];
  let rescans: number;

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'framework-installer-')));
    writeFileSync(join(projectRoot, 'project.godot'), 'config_version=5\n');
    switched = [];
    rescans = 0;
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function installer(git: ProcessRunner): TestFrameworkInstaller {
    return new TestFrameworkInstaller({
      projectRoot,
      processRunner: git,
      plugins: {
        setEnabled: (plugin: string, enabled: boolean): Promise<SwitchedPlugin> => {
          switched.push([plugin, enabled]);
          return Promise.resolve({ plugin, enabled, changed: true, through: 'editor', autoloadsLeft: [] });
        },
      },
      rescan: () => {
        rescans += 1;
        return Promise.resolve();
      },
    });
  }

  it('downloads the pinned release of GUT into res://addons/gut, rescans and enables its plugin', async () => {
    const git = new FakeGit(gutCommit);

    const installed = await installer(git).install('gut');

    expect(git.commands[0]).toEqual(['git', '-c', 'advice.detachedHead=false', 'clone', '--quiet', '--depth', '1', '--branch', 'v9.7.1', 'https://github.com/bitwes/Gut.git', expect.any(String)]);
    expect(git.commands.map((command) => command[0])).toEqual(['git', 'git', 'git', 'tar']);
    expect(readFileSync(join(projectRoot, 'addons', 'gut', 'plugin.cfg'), 'utf8')).toContain('Gut');
    expect(installed).toMatchObject({ path: 'res://addons/gut', downloaded: true, plugin: { plugin: 'gut', enabled: true } });
    expect(rescans).toBe(1);
    expect(switched).toEqual([['gut', true]]);
  });

  it('only enables a framework that is installed already', async () => {
    mkdirSync(join(projectRoot, 'addons', 'gut'), { recursive: true });
    writeFileSync(join(projectRoot, 'addons', 'gut', 'plugin.cfg'), '[plugin]\n');
    const git = new FakeGit(gutCommit);

    const installed = await installer(git).install('gut');

    expect(git.commands).toEqual([]);
    expect(installed.downloaded).toBe(false);
    expect(switched).toEqual([['gut', true]]);
  });

  it('refuses a release whose tag points at another commit', async () => {
    await expect(installer(new FakeGit('0000000')).install('gut')).rejects.toThrow(TestFrameworkInstallError);
    expect(existsSync(join(projectRoot, 'addons', 'gut'))).toBe(false);
    expect(switched).toEqual([]);
  });
});
