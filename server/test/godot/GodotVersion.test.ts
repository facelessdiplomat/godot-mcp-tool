import { describe, expect, it } from 'vitest';
import { GodotVersion } from '../../src/godot/GodotVersion.js';

describe('GodotVersion', () => {
  it('parses a custom build without a patch number', () => {
    const version = GodotVersion.parse('4.8.beta.custom_build.679066724');

    expect(version.major).toBe(4);
    expect(version.minor).toBe(8);
    expect(version.patch).toBe(0);
    expect(version.status).toBe('beta');
    expect(version.build).toBe('custom_build');
    expect(version.hash).toBe('679066724');
  });

  it('parses an official release with a patch number', () => {
    const version = GodotVersion.parse('4.2.2.stable.official.15073afe3');

    expect(version.patch).toBe(2);
    expect(version.status).toBe('stable');
    expect(version.build).toBe('official');
  });

  it('parses a build without a commit hash', () => {
    const version = GodotVersion.parse('4.3.stable.custom_build');

    expect(version.hash).toBe('');
    expect(version.toString()).toBe('4.3.stable.custom_build');
  });

  it('parses a .NET build with the mono module configuration', () => {
    const version = GodotVersion.parse('4.3.stable.mono.official.77dcf97d8');

    expect(version.moduleConfig).toBe('mono');
    expect(version.build).toBe('official');
    expect(version.hash).toBe('77dcf97d8');
    expect(version.toString()).toBe('4.3.stable.mono.official.77dcf97d8');
  });

  it('ignores surrounding whitespace', () => {
    expect(GodotVersion.parse('  4.7.stable.official.abcdef123\n').toString()).toBe('4.7.stable.official.abcdef123');
  });

  it('formats the canonical version string', () => {
    expect(GodotVersion.parse('4.2.2.stable.official.15073afe3').toString()).toBe('4.2.2.stable.official.15073afe3');
  });

  it('compares against a minimum version', () => {
    const version = GodotVersion.parse('4.8.beta.custom_build.679066724');

    expect(version.isAtLeast(4, 5)).toBe(true);
    expect(version.isAtLeast(4, 8)).toBe(true);
    expect(version.isAtLeast(4, 9)).toBe(false);
    expect(version.isAtLeast(5, 0)).toBe(false);
  });

  it('rejects text that is not a Godot version', () => {
    expect(() => GodotVersion.parse('Godot Engine')).toThrow(/not a Godot version/);
  });
});
