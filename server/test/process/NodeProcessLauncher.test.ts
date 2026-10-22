import { describe, expect, it } from 'vitest';
import { NodeProcessLauncher } from '../../src/process/ProcessLauncher.js';

function exitOf(process: ReturnType<NodeProcessLauncher['launch']>): Promise<number | null> {
  return new Promise((resolve) => {
    process.onExit(resolve);
  });
}

describe('NodeProcessLauncher', () => {
  it('passes on the output and the exit code', async () => {
    const launched = new NodeProcessLauncher().launch(process.execPath, ['-e', "console.log('hello'); console.error('oops'); process.exit(3)"], process.cwd());
    let output = '';
    launched.onOutput((text) => {
      output += text;
    });

    const exitCode = await exitOf(launched);

    expect(exitCode).toBe(3);
    expect(output).toContain('hello');
    expect(output).toContain('oops');
    expect(launched.hasExited).toBe(true);
  });

  it('stops a process that keeps running', async () => {
    const launched = new NodeProcessLauncher().launch(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], process.cwd());
    const exited = exitOf(launched);

    launched.stop();

    await exited;
    expect(launched.hasExited).toBe(true);
  });

  it('reports a command that cannot start as an exit', async () => {
    const launched = new NodeProcessLauncher().launch('/nonexistent/godot', [], process.cwd());
    let output = '';
    launched.onOutput((text) => {
      output += text;
    });

    const exitCode = await exitOf(launched);

    expect(exitCode).toBeNull();
    expect(output).toContain('/nonexistent/godot');
  });
});
