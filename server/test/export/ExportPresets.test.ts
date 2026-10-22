import { describe, expect, it } from 'vitest';
import { readExportPresets } from '../../src/export/ExportPresets.js';

const presetsWrittenByTheEditor = [
  '[preset.0]',
  '',
  'name="macOS"',
  'platform="macOS"',
  'runnable=true',
  'advanced_options=false',
  'dedicated_server=false',
  'custom_features=""',
  'export_filter="all_resources"',
  'include_filter=""',
  'exclude_filter=""',
  'export_path="build/macos/Space \\"Rocks\\".zip"',
  'patches=PackedStringArray()',
  'seed=0',
  'encrypt_pck=false',
  'script_export_mode=2',
  '',
  '[preset.0.options]',
  '',
  'export/distribution_type=1',
  'binary_format/architecture="universal"',
  'custom_template/debug=""',
  'custom_template/release=""',
  'application/additional_plist_content="<key>Line</key>',
  'name=\\"not a preset name\\""',
  'privacy/camera_usage_description_localized={',
  '"en": "Camera",',
  'export_path: "not a path"',
  '}',
  '',
  '[preset.1]',
  '',
  'name="Windows Desktop"',
  'platform="Windows Desktop"',
  'runnable=true',
  'export_path=""',
  '',
  '[preset.1.options]',
  '',
  'custom_template/release="templates/windows_release.exe"',
  '',
].join('\n');

describe('readExportPresets', () => {
  it('reads the name, platform and export path of every preset', () => {
    expect(readExportPresets(presetsWrittenByTheEditor)).toEqual([
      { name: 'macOS', platform: 'macOS', exportPath: 'build/macos/Space "Rocks".zip' },
      { name: 'Windows Desktop', platform: 'Windows Desktop', exportPath: '' },
    ]);
  });

  it('calls the Linux platform of presets from before Godot 4.3 by its current name', () => {
    const presets = readExportPresets(['[preset.0]', 'name="Server"', 'platform="Linux/X11"', 'export_path="build/server.x86_64"'].join('\n'));

    expect(presets).toEqual([{ name: 'Server', platform: 'Linux', exportPath: 'build/server.x86_64' }]);
  });

  it('finds no presets in an empty file', () => {
    expect(readExportPresets('')).toEqual([]);
  });
});
