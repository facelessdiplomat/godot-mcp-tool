import { describe, expect, it } from 'vitest';
import { GodotCli } from '../../src/godot/GodotCli.js';
import type { ProcessResult, ProcessRunner } from '../../src/process/ProcessRunner.js';

class FakeProcessRunner implements ProcessRunner {
  readonly calls: { command: string; args: readonly string[] }[] = [];

  constructor(private readonly result: ProcessResult) {}

  run(command: string, args: readonly string[]): Promise<ProcessResult> {
    this.calls.push({ command, args });
    return Promise.resolve(this.result);
  }
}

describe('GodotCli', () => {
  it('reads the version from the --version output', async () => {
    const runner = new FakeProcessRunner({ exitCode: 0, stdout: '4.8.beta.custom_build.679066724\n', stderr: '' });

    const version = await new GodotCli(runner, '/opt/godot/godot').version();

    expect(version.toString()).toBe('4.8.beta.custom_build.679066724');
    expect(runner.calls).toEqual([{ command: '/opt/godot/godot', args: ['--version'] }]);
  });

  it('uses the last non-empty line of the output', async () => {
    const runner = new FakeProcessRunner({ exitCode: 0, stdout: 'Some banner\n4.7.stable.official.abcdef123\n\n', stderr: '' });

    const version = await new GodotCli(runner, '/opt/godot/godot').version();

    expect(version.toString()).toBe('4.7.stable.official.abcdef123');
  });

  it('fails with the error output when the process exits with an error', async () => {
    const runner = new FakeProcessRunner({ exitCode: 1, stdout: '', stderr: 'cannot open display' });

    await expect(new GodotCli(runner, '/opt/godot/godot').version()).rejects.toThrow(/cannot open display/);
  });
});
