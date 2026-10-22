import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordFile } from '../../src/runtime/RecordFile.js';

describe('RecordFile', () => {
  let directory: string;
  let path: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'record-file-'));
    path = join(directory, 'game.ndjson');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('reads nothing while the file does not exist', () => {
    expect(new RecordFile(path).readNew()).toEqual([]);
  });

  it('reads each record once as lines are appended', () => {
    const records = new RecordFile(path);
    writeFileSync(path, '{"type":"log"}\n');

    expect(records.readNew()).toEqual([{ type: 'log' }]);
    appendFileSync(path, '{"type":"ready"}\n');
    expect(records.readNew()).toEqual([{ type: 'ready' }]);
    expect(records.readNew()).toEqual([]);
  });

  it('waits for the rest of a line that is still being written', () => {
    const records = new RecordFile(path);
    writeFileSync(path, '{"type":"lo');

    expect(records.readNew()).toEqual([]);
    appendFileSync(path, 'g"}\n');
    expect(records.readNew()).toEqual([{ type: 'log' }]);
  });

  it('skips lines that are not JSON', () => {
    const records = new RecordFile(path);
    writeFileSync(path, 'garbage\n{"type":"ready"}\n');

    expect(records.readNew()).toEqual([{ type: 'ready' }]);
  });

  it('starts over after a reset', () => {
    const records = new RecordFile(path);
    writeFileSync(path, '{"type":"log"}\n');
    records.readNew();

    records.reset();
    writeFileSync(path, '{"type":"ready"}\n');

    expect(records.readNew()).toEqual([{ type: 'ready' }]);
  });
});
