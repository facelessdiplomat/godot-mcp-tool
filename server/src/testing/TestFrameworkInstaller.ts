import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { PluginSwitch, SwitchedPlugin } from '../addon/PluginSwitch.js';
import type { ProcessRunner } from '../process/ProcessRunner.js';
import { describeError } from '../util/errors.js';
import { type TestFramework, type TestFrameworkKey, testFrameworks } from './TestFrameworks.js';

export interface InstalledFramework {
  readonly framework: TestFramework;
  readonly path: string;
  readonly downloaded: boolean;
  readonly plugin: SwitchedPlugin;
}

export interface TestFrameworkInstallerDependencies {
  readonly projectRoot: string | undefined;
  readonly processRunner: ProcessRunner;
  readonly plugins: Pick<PluginSwitch, 'setEnabled'>;
  readonly rescan: () => Promise<void>;
}

export class TestFrameworkInstallError extends Error {
  override readonly name = 'TestFrameworkInstallError';
}

const downloadTimeoutMs = 180_000;
const pluginFile = 'plugin.cfg';

export class TestFrameworkInstaller {
  constructor(private readonly dependencies: TestFrameworkInstallerDependencies) {}

  async install(key: TestFrameworkKey): Promise<InstalledFramework> {
    const { projectRoot } = this.dependencies;
    if (projectRoot === undefined) {
      throw new TestFrameworkInstallError('No Godot project was found, so there is nothing to install into. Create one with project_create or set GODOT_PROJECT_PATH.');
    }
    const framework = testFrameworks.find((candidate) => candidate.key === key);
    if (framework === undefined) {
      throw new TestFrameworkInstallError(`Unknown test framework "${key}"; use gut or gdunit4.`);
    }
    const { addonFolder } = framework.release;
    const target = join(projectRoot, 'addons', addonFolder);
    const downloaded = !existsSync(join(target, pluginFile));
    if (downloaded) {
      await this.download(framework, target);
    }
    await this.dependencies.rescan();
    const plugin = await this.dependencies.plugins.setEnabled(addonFolder, true);
    return { framework, path: `res://addons/${addonFolder}`, downloaded, plugin };
  }

  private async download(framework: TestFramework, target: string): Promise<void> {
    const { tag, commit, repository, addonFolder } = framework.release;
    const workspace = mkdtempSync(join(tmpdir(), 'godot-mcp-test-framework-'));
    try {
      const clone = join(workspace, 'clone');
      const archive = join(workspace, 'package.tar');
      const unpacked = join(workspace, 'package');
      await this.run('git', ['-c', 'advice.detachedHead=false', 'clone', '--quiet', '--depth', '1', '--branch', tag, repository, clone]);
      const head = (await this.run('git', ['-C', clone, 'rev-parse', 'HEAD'])).trim();
      if (head !== commit) {
        throw new TestFrameworkInstallError(`${framework.name} ${tag} points at ${head} instead of ${commit}, so it was not installed; check that release first.`);
      }
      await this.run('git', ['-C', clone, 'archive', '--format=tar', '-o', archive, 'HEAD', `addons/${addonFolder}`]);
      mkdirSync(unpacked);
      await this.run('tar', ['-x', '-f', archive, '-C', unpacked]);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(unpacked, 'addons', addonFolder), target, { recursive: true });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }

  private async run(command: string, args: readonly string[]): Promise<string> {
    let result;
    try {
      result = await this.dependencies.processRunner.run(command, args, { timeoutMs: downloadTimeoutMs });
    } catch (error) {
      throw new TestFrameworkInstallError(`${command} could not run (${describeError(error)}); the download needs git and tar.`, { cause: error });
    }
    if (result.exitCode !== 0) {
      throw new TestFrameworkInstallError(`${command} ${args.find((argument) => !argument.startsWith('-') && !argument.includes('=')) ?? ''} failed: ${result.stderr.trim() || result.stdout.trim()}`);
    }
    return result.stdout;
  }
}
