import type { PngImage, Rgb } from '../../integration/pngImage.js';

export function averageColorOf(image: PngImage, share: number): Rgb {
  const left = Math.floor(image.width * (0.5 - share / 2));
  const top = Math.floor(image.height * (0.5 - share / 2));
  const width = Math.max(1, Math.floor(image.width * share));
  const height = Math.max(1, Math.floor(image.height * share));
  const sums = [0, 0, 0];
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      image.pixel(x, y).forEach((channel, index) => {
        sums[index] = (sums[index] ?? 0) + channel;
      });
    }
  }
  const count = width * height;
  return [Math.round((sums[0] ?? 0) / count), Math.round((sums[1] ?? 0) / count), Math.round((sums[2] ?? 0) / count)];
}
