import { describe, expect, it } from 'vitest';
import { parseCheckOnlyOutput } from '../../src/scripts/CheckOnlyOutput.js';

describe('parseCheckOnlyOutput', () => {
  it('reads script errors with their lines and leaves out the loader noise', () => {
    const output = [
      'Godot Engine v4.8.beta.custom_build.679066724 - https://godotengine.org',
      'SCRIPT ERROR: Parse Error: Expected end of statement after variable declaration, found "Literal" instead.',
      '          at: GDScript::reload (res://broken.gd:5)',
      'ERROR: Failed to load script "res://broken.gd" with error "Parse error".',
      '   at: load (modules/gdscript/gdscript_resource_format.cpp:50)',
    ].join('\n');

    expect(parseCheckOnlyOutput(output, [])).toEqual([
      { line: 5, severity: 'error', message: 'Expected end of statement after variable declaration, found "Literal" instead.' },
    ]);
  });

  it('keeps the first of several reports for one line', () => {
    const output = [
      'SCRIPT ERROR: Parse Error: Cannot assign a value of type "String" as "int".',
      '          at: GDScript::reload (res://uses_autoload.gd:6)',
      'SCRIPT ERROR: Parse Error: Cannot assign a value of type String to variable "speed" with specified type int.',
      '          at: GDScript::reload (res://uses_autoload.gd:6)',
    ].join('\n');

    expect(parseCheckOnlyOutput(output, [])).toEqual([{ line: 6, severity: 'error', message: 'Cannot assign a value of type "String" as "int".' }]);
  });

  it('drops errors about identifiers that are autoloads', () => {
    const output = [
      'SCRIPT ERROR: Parse Error: Identifier "GameState" not declared in the current scope.',
      '          at: GDScript::reload (res://player.gd:4)',
      'SCRIPT ERROR: Parse Error: Identifier "spd" not declared in the current scope.',
      '          at: GDScript::reload (res://player.gd:9)',
    ].join('\n');

    expect(parseCheckOnlyOutput(output, ['GameState'])).toEqual([{ line: 9, severity: 'error', message: 'Identifier "spd" not declared in the current scope.' }]);
  });

  it('finds nothing in the output of a valid script', () => {
    expect(parseCheckOnlyOutput('Godot Engine v4.8 - https://godotengine.org\n', [])).toEqual([]);
  });
});
