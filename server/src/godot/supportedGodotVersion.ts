import type { GodotVersion } from './GodotVersion.js';

const minimumMajor = 4;
const minimumMinor = 7;

export const minimumGodotVersionText = `${String(minimumMajor)}.${String(minimumMinor)}`;

export function isSupportedGodotVersion(version: GodotVersion): boolean {
  return version.isAtLeast(minimumMajor, minimumMinor);
}
