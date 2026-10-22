import { describe, expect, it } from 'vitest';
import { readExportOutput } from '../../src/export/ExportOutput.js';

const incompletePresetNoise = [
  'ERROR: Couldn\'t find the given section "preset.0" and key "exclude_filter", and no default was given.',
  '   at: get_value (core/io/config_file.cpp:61)',
  'ERROR: Cannot get keys from nonexistent section "preset.0.options".',
  '   at: get_section_keys (core/io/config_file.cpp:94)',
];

describe('readExportOutput', () => {
  it('reads the missing export template and leaves out the noise of an incomplete preset', () => {
    const output = readExportOutput(
      [
        ...incompletePresetNoise,
        'ERROR: Cannot export project with preset "macOS" due to configuration errors:',
        'No export template found at the expected path:',
        '/Users/me/Library/Application Support/Godot/export_templates/4.8.beta/macos.zip',
        '   at: _fs_changed (editor/editor_node.cpp:1471)',
        'ERROR: Project export for preset "macOS" failed.',
        '   at: _fs_changed (editor/editor_node.cpp:1487)',
      ].join('\n'),
    );

    expect(output).toEqual({
      errors: [
        'Cannot export project with preset "macOS" due to configuration errors: No export template found at the expected path: /Users/me/Library/Application Support/Godot/export_templates/4.8.beta/macos.zip',
      ],
      warnings: [],
      missingTemplates: true,
      expectedTemplatePath: '/Users/me/Library/Application Support/Godot/export_templates/4.8.beta/macos.zip',
    });
  });

  it('reads export messages between the colored progress lines', () => {
    const output = readExportOutput(
      [
        '[   0% ] \u001b[90m\u001b[1msavepack\u001b[22m | Started Packing (102 steps)\u001b[39m\u001b[0m',
        'ERROR: Save PCK: Can\'t open file for writing at path "build/nested/game.pck".',
        '   at: add_message (./editor/export/editor_export_platform.h:276)',
        '\u001b[92m[ DONE ]\u001b[39m \u001b[1msavepack\u001b[22m',
        'WARNING: Code Signing: Code signing is disabled. The exported project will not run on Macs with enabled Gatekeeper.',
        '   at: add_message (./editor/export/editor_export_platform.h:273)',
        'WARNING: Project export for preset "macOS" completed with warnings.',
        '   at: _fs_changed (editor/editor_node.cpp:1494)',
        'SCRIPT ERROR: Parse Error: Identifier "speed" not declared in the current scope.',
        '          at: GDScript::reload (res://player.gd:12)',
      ].join('\n'),
    );

    expect(output.errors).toEqual([
      'Save PCK: Can\'t open file for writing at path "build/nested/game.pck".',
      'Parse Error: Identifier "speed" not declared in the current scope. (res://player.gd:12)',
    ]);
    expect(output.warnings).toEqual(['Code Signing: Code signing is disabled. The exported project will not run on Macs with enabled Gatekeeper.']);
    expect(output.missingTemplates).toBe(false);
  });

  it('notices a custom template that is missing', () => {
    const output = readExportOutput(
      ['ERROR: Cannot export project with preset "Windows Desktop" due to configuration errors:', 'Custom release template not found.', '   at: _fs_changed (editor/editor_node.cpp:1471)'].join('\n'),
    );

    expect(output.missingTemplates).toBe(true);
    expect(output.expectedTemplatePath).toBeUndefined();
  });
});
