const headerSeparator = Buffer.from('\r\n\r\n');

export class ContentLengthMessageReader {
  private buffered = Buffer.alloc(0);

  read(chunk: Buffer): unknown[] {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    const messages: unknown[] = [];
    for (;;) {
      const headerEnd = this.buffered.indexOf(headerSeparator);
      if (headerEnd === -1) {
        return messages;
      }
      const contentLength = parseContentLength(this.buffered.subarray(0, headerEnd).toString('ascii'));
      const bodyStart = headerEnd + headerSeparator.length;
      if (this.buffered.length < bodyStart + contentLength) {
        return messages;
      }
      const body = this.buffered.subarray(bodyStart, bodyStart + contentLength).toString('utf8');
      this.buffered = this.buffered.subarray(bodyStart + contentLength);
      messages.push(JSON.parse(body) as unknown);
    }
  }
}

export function encodeContentLengthMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${String(body.length)}\r\n\r\n`, 'ascii'), body]);
}

function parseContentLength(header: string): number {
  const match = /content-length:\s*(\d+)/i.exec(header);
  if (match?.[1] === undefined) {
    throw new Error(`A message arrived without Content-Length: ${header}`);
  }
  return Number(match[1]);
}
