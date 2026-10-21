import type { ProcessRunner } from '../process/ProcessRunner.js';
import { GodotVersion } from './GodotVersion.js';

const versionTimeoutMs = 15_000;

export class GodotCli {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly executablePath: string,
  ) {}

  async version(): Promise<GodotVersion> {
    const result = await this.runner.run(this.executablePath, ['--version'], { timeoutMs: versionTimeoutMs });
    if (result.exitCode !== 0) {
      const errorOutput = [result.stderr, result.stdout].map((output) => output.trim()).find((output) => output !== '');
      throw new Error(`${this.executablePath} --version failed: ${errorOutput ?? `exit code ${String(result.exitCode)}`}`);
    }
    const lastLine = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .at(-1);
    return GodotVersion.parse(lastLine ?? '');
  }
}
