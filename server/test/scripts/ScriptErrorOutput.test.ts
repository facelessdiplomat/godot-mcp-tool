import { describe, expect, it } from 'vitest';
import { readScriptErrors } from '../../src/scripts/ScriptErrorOutput.js';

describe('readScriptErrors', () => {
  it('reads each script error with the file and line printed after it', () => {
    const output = [
      'SCRIPT ERROR: Parse Error: Identifier "SPED" not declared in the current scope.',
      '          at: GDScript::reload (res://test/test_player.gd:15)',
      'ERROR: Failed to load script "res://test/test_player.gd" with error "Parse error".',
      '   at: load (modules/gdscript/gdscript_resource_format.cpp:50)',
      "SCRIPT ERROR: Invalid access to property or key 'speed' on a base object of type 'Nil'.",
      '          at: test_dash (res://test/test_player.gd:30)',
      '          GDScript backtrace (most recent call first):',
    ].join('\n');

    expect(readScriptErrors(output)).toEqual([
      { file: 'res://test/test_player.gd', line: 15, message: 'Parse Error: Identifier "SPED" not declared in the current scope.' },
      { file: 'res://test/test_player.gd', line: 30, message: "Invalid access to property or key 'speed' on a base object of type 'Nil'." },
    ]);
  });

  it('skips script errors without a place in a script', () => {
    expect(readScriptErrors('SCRIPT ERROR: Something went wrong.\n   at: <native>')).toEqual([]);
  });
});
