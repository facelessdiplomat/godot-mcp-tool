const bytesPerKilobyte = 1024;
const sizeUnits = ['KB', 'MB', 'GB'];

export function sizeText(bytes: number): string {
  if (bytes < bytesPerKilobyte) {
    return `${String(bytes)} B`;
  }
  let value = bytes / bytesPerKilobyte;
  let unitIndex = 0;
  while (value >= bytesPerKilobyte && unitIndex < sizeUnits.length - 1) {
    value /= bytesPerKilobyte;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${sizeUnits[unitIndex] ?? ''}`;
}
