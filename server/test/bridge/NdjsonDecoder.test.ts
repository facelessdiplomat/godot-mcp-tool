import { describe, expect, it } from 'vitest';
import { BridgeProtocolError } from '../../src/bridge/BridgeErrors.js';
import { NdjsonDecoder } from '../../src/bridge/NdjsonDecoder.js';

describe('NdjsonDecoder', () => {
  it('decodes a complete line', () => {
    expect(new NdjsonDecoder().decode('{"id":1}\n')).toEqual([{ id: 1 }]);
  });

  it('decodes several lines from one chunk', () => {
    expect(new NdjsonDecoder().decode('{"id":1}\n{"id":2}\n')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('keeps an incomplete line until the rest arrives', () => {
    const decoder = new NdjsonDecoder();

    expect(decoder.decode('{"id":')).toEqual([]);
    expect(decoder.decode('3}\n')).toEqual([{ id: 3 }]);
  });

  it('skips empty lines and accepts CRLF endings', () => {
    expect(new NdjsonDecoder().decode('\r\n{"id":4}\r\n\n')).toEqual([{ id: 4 }]);
  });

  it('rejects a line that is not JSON', () => {
    expect(() => new NdjsonDecoder().decode('GET / HTTP/1.1\n')).toThrow(BridgeProtocolError);
  });

  it('rejects a line that grows beyond the limit without a line break', () => {
    const decoder = new NdjsonDecoder({ maximumLineLength: 16 });

    expect(() => decoder.decode('x'.repeat(17))).toThrow(/longer than 16/);
  });
});
