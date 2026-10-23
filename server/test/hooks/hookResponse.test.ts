import { describe, expect, it } from 'vitest';
import { respondToEditedScript } from '../../src/hooks/hookResponse.js';

const report = ['1 error in 1 of 1 script (checked with the editor\'s language server).', 'res://player/player.gd', '  12:5 error: Identifier "SPEEDD" not declared in the current scope.'].join('\n');

describe('the answer of the hook to Claude Code', () => {
  it('says nothing when there is nothing to report', () => {
    expect(respondToEditedScript({ kind: 'silent' })).toEqual({ exitCode: 0, standardOutput: [], standardError: [] });
  });

  it('shows errors to Claude through exit code 2 and standard error', () => {
    expect(respondToEditedScript({ kind: 'problems', hasErrors: true, report })).toEqual({ exitCode: 2, standardOutput: [], standardError: report.split('\n') });
  });

  it('adds warnings to the context of Claude without an error', () => {
    const warnings = 'res://player/player.gd\n  3:5 warning (UNUSED_VARIABLE): The local variable "jump" is declared but never used.';

    expect(respondToEditedScript({ kind: 'problems', hasErrors: false, report: warnings })).toEqual({
      exitCode: 0,
      standardOutput: [JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: warnings } })],
      standardError: [],
    });
  });
});
