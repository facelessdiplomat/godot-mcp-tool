import { describe, expect, it } from 'vitest';
import { formatLogEntries } from '../../../src/tools/formatting/logEntries.js';

describe('formatLogEntries', () => {
  it('prints game output as it is and marks errors with their place and stack', () => {
    const text = formatLogEntries([
      { seq: 1, source: 'game', level: 'info', message: 'Arena loaded' },
      {
        seq: 2,
        source: 'game',
        level: 'error',
        message: "Invalid access to property or key 'speed' on a base object of type 'Nil'.",
        location: 'res://player.gd:12',
        function: '_ready',
        stack: ['res://player.gd:12 in _ready', 'res://levels/arena.gd:8 in _ready'],
      },
      { seq: 3, source: 'game', level: 'warning', message: 'Slow frame.', location: 'res://hud.gd:3', function: '_process' },
    ]);

    expect(text).toBe(
      [
        'Arena loaded',
        "ERROR res://player.gd:12 in _ready: Invalid access to property or key 'speed' on a base object of type 'Nil'.",
        '  at res://player.gd:12 in _ready',
        '  at res://levels/arena.gd:8 in _ready',
        'WARNING res://hud.gd:3 in _process: Slow frame.',
      ].join('\n'),
    );
  });

  it('labels entries from the editor', () => {
    const text = formatLogEntries([
      { seq: 4, source: 'editor', level: 'error', message: 'Parse Error: Expected end of statement.', location: 'res://enemy.gd:7' },
    ]);

    expect(text).toBe('EDITOR ERROR res://enemy.gd:7: Parse Error: Expected end of statement.');
  });

  it('prints errors without a location plainly', () => {
    expect(formatLogEntries([{ seq: 5, source: 'game', level: 'error', message: 'Broken pipe' }])).toBe('ERROR Broken pipe');
  });
});
