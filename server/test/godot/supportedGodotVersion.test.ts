import { describe, expect, it } from 'vitest';
import { GodotVersion } from '../../src/godot/GodotVersion.js';
import { isSupportedGodotVersion, minimumGodotVersionText } from '../../src/godot/supportedGodotVersion.js';

describe('supportedGodotVersion', () => {
  it('names Godot 4.7 as the oldest supported version', () => {
    expect(minimumGodotVersionText).toBe('4.7');
  });

  it('supports Godot 4.7 and newer', () => {
    for (const text of ['4.7.stable.official.5b4e0cb0f', '4.7.2.stable.official.ed1daf0bf', '4.8.beta.custom_build.679066724', '5.0.dev.custom_build']) {
      expect(isSupportedGodotVersion(GodotVersion.parse(text))).toBe(true);
    }
  });

  it('does not support Godot 4.6 and older, which lack editor features the addon needs', () => {
    for (const text of ['4.6.2.stable.official.71f334935', '4.5.2.stable.official.6ce3de25a', '3.6.stable.official.de2f0f147']) {
      expect(isSupportedGodotVersion(GodotVersion.parse(text))).toBe(false);
    }
  });
});
