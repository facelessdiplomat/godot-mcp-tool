import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeProcessRunner } from '../../src/process/ProcessRunner.js';

describe('NodeProcessRunner', () => {
  it('runs a command in the given folder', async () => {
    const folder = realpathSync(mkdtempSync(join(tmpdir(), 'runner-')));
    try {
      const result = await new NodeProcessRunner().run(process.execPath, ['-e', 'console.log(process.cwd())'], { timeoutMs: 10_000, cwd: folder });

      expect(result.exitCode).toBe(0);
      expect(realpathSync(result.stdout.trim())).toBe(folder);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('reports the exit code of a failing command', async () => {
    const result = await new NodeProcessRunner().run(process.execPath, ['-e', 'process.exit(4)'], { timeoutMs: 10_000 });

    expect(result.exitCode).toBe(4);
  });
});
