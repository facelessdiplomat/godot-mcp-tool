import { inflateSync } from 'node:zlib';

export type Rgb = readonly [number, number, number];

export interface PngImage {
  readonly width: number;
  readonly height: number;
  pixel(x: number, y: number): Rgb;
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const chunkFrameBytes = 12;
const rgbColorType = 2;
const rgbaColorType = 6;

export function decodePng(file: Buffer): PngImage {
  if (!file.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error('The file is not a PNG image');
  }
  let width = 0;
  let height = 0;
  let channels = 0;
  const compressedRows: Buffer[] = [];
  for (let offset = pngSignature.length; offset < file.length; offset += chunkFrameBytes + file.readUInt32BE(offset)) {
    const type = file.toString('ascii', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + file.readUInt32BE(offset));
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = readChannelCount(body);
    } else if (type === 'IDAT') {
      compressedRows.push(body);
    }
  }
  const pixels = unfilterRows(inflateSync(Buffer.concat(compressedRows)), width * channels, height, channels);
  return {
    width,
    height,
    pixel: (x, y) => {
      const start = (y * width + x) * channels;
      return [pixels[start] ?? 0, pixels[start + 1] ?? 0, pixels[start + 2] ?? 0];
    },
  };
}

function readChannelCount(header: Buffer): number {
  const [bitDepth, colorType, , , interlace] = header.subarray(8, 13);
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== rgbColorType && colorType !== rgbaColorType)) {
    throw new Error(`Unsupported PNG layout: bit depth ${String(bitDepth)}, color type ${String(colorType)}, interlace ${String(interlace)}`);
  }
  return colorType === rgbaColorType ? 4 : 3;
}

function unfilterRows(filtered: Buffer, stride: number, height: number, channels: number): Buffer {
  const pixels = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (stride + 1);
    const filter = filtered[rowStart] ?? 0;
    for (let index = 0; index < stride; index += 1) {
      const target = row * stride + index;
      const left = index >= channels ? (pixels[target - channels] ?? 0) : 0;
      const up = row > 0 ? (pixels[target - stride] ?? 0) : 0;
      const upLeft = row > 0 && index >= channels ? (pixels[target - stride - channels] ?? 0) : 0;
      pixels[target] = ((filtered[rowStart + 1 + index] ?? 0) + predict(filter, left, up, upLeft)) & 0xff;
    }
  }
  return pixels;
}

function predict(filter: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return Math.floor((left + up) / 2);
    case 4:
      return paeth(left, up, upLeft);
    default:
      throw new Error(`Unknown PNG row filter ${String(filter)}`);
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) {
    return left;
  }
  return toUp <= toUpLeft ? up : upLeft;
}
