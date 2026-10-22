import { describe, expect, it } from 'vitest';
import { LogBook } from '../../src/runtime/LogBook.js';

function sequenceNumbers(entries: readonly Record<string, unknown>[]): unknown[] {
  return entries.map((entry) => entry['seq']);
}

describe('LogBook', () => {
  it('numbers entries and records their source', () => {
    const book = new LogBook(5);
    book.append({ level: 'info', message: 'started' }, 'game');
    book.append({ level: 'error', message: 'exited' }, 'process');

    const page = book.entriesAfter(0, [], 10);

    expect(page.entries).toEqual([
      { level: 'info', message: 'started', seq: 1, source: 'game' },
      { level: 'error', message: 'exited', seq: 2, source: 'process' },
    ]);
    expect(book.lastSeq).toBe(2);
  });

  it('filters by level after a cursor and pages', () => {
    const book = new LogBook(10);
    for (const level of ['info', 'error', 'error', 'info', 'error']) {
      book.append({ level, message: level }, 'game');
    }

    const page = book.entriesAfter(1, ['error'], 2);

    expect(sequenceNumbers(page.entries)).toEqual([2, 3]);
    expect(page.more).toBe(true);
    expect(page.next_after).toBe(3);
  });

  it('reports entries that no longer fit', () => {
    const book = new LogBook(3);
    for (let index = 0; index < 5; index += 1) {
      book.append({ level: 'info', message: String(index) }, 'game');
    }

    const page = book.entriesAfter(0, [], 10);

    expect(sequenceNumbers(page.entries)).toEqual([3, 4, 5]);
    expect(page.skipped).toBe(2);
    expect(page.next_after).toBe(5);
    expect(page.more).toBe(false);
  });
});
