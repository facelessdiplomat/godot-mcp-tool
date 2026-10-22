import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

export class RecordFile {
  private offset = 0;
  private partialLine = '';
  private decoder = new StringDecoder('utf8');

  constructor(readonly path: string) {}

  reset(): void {
    this.offset = 0;
    this.partialLine = '';
    this.decoder = new StringDecoder('utf8');
  }

  readNew(): unknown[] {
    let descriptor: number;
    try {
      descriptor = openSync(this.path, 'r');
    } catch {
      return [];
    }
    try {
      const size = fstatSync(descriptor).size;
      if (size < this.offset) {
        this.reset();
      }
      if (size === this.offset) {
        return [];
      }
      const buffer = Buffer.alloc(size - this.offset);
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, this.offset);
      this.offset += bytesRead;
      const lines = (this.partialLine + this.decoder.write(buffer.subarray(0, bytesRead))).split('\n');
      this.partialLine = lines.pop() ?? '';
      return lines.flatMap(parseRecord);
    } finally {
      closeSync(descriptor);
    }
  }
}

function parseRecord(line: string): unknown[] {
  const trimmed = line.trim();
  if (trimmed === '') {
    return [];
  }
  try {
    return [JSON.parse(trimmed) as unknown];
  } catch {
    return [];
  }
}
