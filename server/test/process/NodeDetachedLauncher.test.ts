import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeDetachedLauncher } from '../../src/process/DetachedLauncher.js';

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('The condition was not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('NodeDetachedLauncher', () => {
  let folder = '';

  beforeEach(() => {
    folder = realpathSync(mkdtempSync(join(tmpdir(), 'detached-')));
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('writes the output of the process to the log and tells how it ended', async () => {
    const logPath = join(folder, 'editor.log');

    const started = new NodeDetachedLauncher().start(process.execPath, ['-e', "console.log('ready'); console.error('warning'); process.exit(2)"], logPath);
    await waitUntil(() => started.endReason !== undefined);

    expect(started.pid).toBeGreaterThan(0);
    expect(started.endReason).toBe('exit code 2');
    expect(readFileSync(logPath, 'utf8')).toContain('ready');
    expect(readFileSync(logPath, 'utf8')).toContain('warning');
  });

  it('tells when the command cannot start', async () => {
    const started = new NodeDetachedLauncher().start(join(folder, 'missing-godot'), [], join(folder, 'editor.log'));
    await waitUntil(() => started.endReason !== undefined);

    expect(started.endReason).toContain('could not start');
  });
});
