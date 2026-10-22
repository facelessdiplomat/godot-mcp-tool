import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { ScriptPathError } from '../../src/scripts/ScriptFiles.js';
import type { ValidationResult } from '../../src/scripts/ScriptValidator.js';
import { ScriptValidateTool } from '../../src/tools/scriptTools.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

function checker(outcome: ValidationResult | Error): { validate: (inputs: readonly string[]) => Promise<ValidationResult>; inputs: string[][] } {
  const inputs: string[][] = [];
  return {
    inputs,
    validate: (paths) => {
      inputs.push([...paths]);
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
    },
  };
}

describe('script_validate', () => {
  it('lists the problems of each script with their places', async () => {
    const validator = checker({
      method: 'language server',
      reports: [
        {
          resourcePath: 'res://player.gd',
          problems: [
            { line: 3, column: 1, severity: 'warning', code: 'UNUSED_VARIABLE', message: 'The local variable "x" is declared but never used.' },
            { line: 12, column: 5, severity: 'error', message: 'Identifier "spd" not declared in the current scope.' },
          ],
        },
        { resourcePath: 'res://enemies/goblin.gd', problems: [] },
      ],
    });

    const result = await new ScriptValidateTool(validator).execute({ paths: ['res://'] });

    expect(validator.inputs).toEqual([['res://']]);
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      [
        "1 error and 1 warning in 1 of 2 scripts (checked with the editor's language server).",
        'res://player.gd',
        '  3:1 warning (UNUSED_VARIABLE): The local variable "x" is declared but never used.',
        '  12:5 error: Identifier "spd" not declared in the current scope.',
        'No problems: res://enemies/goblin.gd',
      ].join('\n'),
    );
  });

  it('names the scripts it found fine', async () => {
    const validator = checker({ method: 'language server', reports: [{ resourcePath: 'res://a.gd', problems: [] }, { resourcePath: 'res://b.gd', problems: [] }] });

    const text = textOf(await new ScriptValidateTool(validator).execute({ paths: ['res://'] }));

    expect(text).toBe("No problems in 2 scripts: res://a.gd, res://b.gd (checked with the editor's language server).");
  });

  it('says how it checked without the editor and why', async () => {
    const validator = checker({
      method: 'check-only',
      fallbackReason: 'Could not reach the language server on 127.0.0.1:6005: connect ECONNREFUSED.',
      reports: [{ resourcePath: 'res://player.gd', problems: [{ line: 2, severity: 'error', message: 'Identifier "spd" not declared in the current scope.' }] }],
    });

    const text = textOf(await new ScriptValidateTool(validator).execute({ paths: ['res://player.gd'] }));

    expect(text).toBe(
      [
        '1 error in 1 of 1 script (checked with godot --check-only, which finds errors but not warnings).',
        'The language server was not used: Could not reach the language server on 127.0.0.1:6005: connect ECONNREFUSED.',
        'res://player.gd',
        '  2 error: Identifier "spd" not declared in the current scope.',
      ].join('\n'),
    );
  });

  it('explains paths it cannot check', async () => {
    const result = await new ScriptValidateTool(checker(new ScriptPathError('res://enemy.gd does not exist.'))).execute({ paths: ['res://enemy.gd'] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('res://enemy.gd does not exist.');
  });

  it('is loaded up front and only reads', () => {
    const tool = new ScriptValidateTool(checker(new Error('unused')));

    expect(tool.name).toBe('script_validate');
    expect(tool.definition.alwaysLoad).toBe(true);
    expect(tool.definition.annotations.readOnlyHint).toBe(true);
  });
});
