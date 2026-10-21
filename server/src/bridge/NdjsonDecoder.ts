import { BridgeProtocolError } from './BridgeErrors.js';

export interface NdjsonDecoderOptions {
  readonly maximumLineLength: number;
}

const defaultOptions: NdjsonDecoderOptions = { maximumLineLength: 64 * 1024 * 1024 };

export class NdjsonDecoder {
  private incompleteLine = '';

  constructor(private readonly options: NdjsonDecoderOptions = defaultOptions) {}

  decode(chunk: string): unknown[] {
    const lines = (this.incompleteLine + chunk).split('\n');
    this.incompleteLine = lines.pop() ?? '';
    if (this.incompleteLine.length > this.options.maximumLineLength) {
      throw new BridgeProtocolError(
        `The editor bridge sent a line longer than ${String(this.options.maximumLineLength)} characters without a line break.`,
      );
    }
    return lines
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map(parseJsonLine);
  }
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    throw new BridgeProtocolError(`The editor bridge sent a line that is not JSON: ${line.slice(0, 80)}`);
  }
}
