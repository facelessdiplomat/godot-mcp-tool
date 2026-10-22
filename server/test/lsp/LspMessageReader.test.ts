import { describe, expect, it } from 'vitest';
import { encodeLspMessage, LspMessageReader } from '../../src/lsp/LspMessageReader.js';

function frame(body: string): Buffer {
  return Buffer.concat([Buffer.from(`Content-Length: ${String(Buffer.byteLength(body))}\r\n\r\n`), Buffer.from(body)]);
}

describe('LspMessageReader', () => {
  it('reads one framed message', () => {
    expect(new LspMessageReader().read(frame('{"id":1,"result":null}'))).toEqual([{ id: 1, result: null }]);
  });

  it('reads several messages from one chunk', () => {
    const chunk = Buffer.concat([frame('{"method":"a"}'), frame('{"method":"b"}')]);

    expect(new LspMessageReader().read(chunk)).toEqual([{ method: 'a' }, { method: 'b' }]);
  });

  it('waits for the rest of a message split across chunks', () => {
    const reader = new LspMessageReader();
    const whole = frame('{"method":"textDocument/publishDiagnostics","params":{"uri":"file:///p/ä.gd"}}');

    expect(reader.read(whole.subarray(0, 20))).toEqual([]);
    expect(reader.read(whole.subarray(20, whole.length - 3))).toEqual([]);
    expect(reader.read(whole.subarray(whole.length - 3))).toEqual([{ method: 'textDocument/publishDiagnostics', params: { uri: 'file:///p/ä.gd' } }]);
  });

  it('accepts extra headers', () => {
    const body = '{"method":"x"}';
    const chunk = Buffer.from(`Content-Length: ${String(body.length)}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n${body}`);

    expect(new LspMessageReader().read(chunk)).toEqual([{ method: 'x' }]);
  });

  it('frames outgoing messages by their byte length', () => {
    expect(encodeLspMessage({ text: 'ä' }).toString()).toBe('Content-Length: 13\r\n\r\n{"text":"ä"}');
  });
});
