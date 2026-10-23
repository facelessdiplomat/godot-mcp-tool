import { describe, expect, it } from 'vitest';
import { ContentLengthMessageReader, encodeContentLengthMessage } from '../../src/protocol/ContentLengthMessages.js';

function frame(body: string): Buffer {
  return Buffer.concat([Buffer.from(`Content-Length: ${String(Buffer.byteLength(body))}\r\n\r\n`), Buffer.from(body)]);
}

describe('ContentLengthMessages', () => {
  it('reads one framed message', () => {
    expect(new ContentLengthMessageReader().read(frame('{"id":1,"result":null}'))).toEqual([{ id: 1, result: null }]);
  });

  it('reads several messages from one chunk', () => {
    const chunk = Buffer.concat([frame('{"method":"a"}'), frame('{"method":"b"}')]);

    expect(new ContentLengthMessageReader().read(chunk)).toEqual([{ method: 'a' }, { method: 'b' }]);
  });

  it('waits for the rest of a message split across chunks', () => {
    const reader = new ContentLengthMessageReader();
    const whole = frame('{"method":"textDocument/publishDiagnostics","params":{"uri":"file:///p/ä.gd"}}');

    expect(reader.read(whole.subarray(0, 20))).toEqual([]);
    expect(reader.read(whole.subarray(20, whole.length - 3))).toEqual([]);
    expect(reader.read(whole.subarray(whole.length - 3))).toEqual([{ method: 'textDocument/publishDiagnostics', params: { uri: 'file:///p/ä.gd' } }]);
  });

  it('accepts extra headers', () => {
    const body = '{"method":"x"}';
    const chunk = Buffer.from(`Content-Length: ${String(body.length)}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n${body}`);

    expect(new ContentLengthMessageReader().read(chunk)).toEqual([{ method: 'x' }]);
  });

  it('frames outgoing messages by their byte length', () => {
    expect(encodeContentLengthMessage({ text: 'ä' }).toString()).toBe('Content-Length: 13\r\n\r\n{"text":"ä"}');
  });
});
