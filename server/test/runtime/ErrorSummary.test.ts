import { describe, expect, it } from 'vitest';
import { ErrorSummary } from '../../src/runtime/ErrorSummary.js';

function status(lastSeq: number, errors: number, recentErrors: readonly Record<string, unknown>[] = []): Record<string, unknown> {
  return { last_seq: lastSeq, errors, warnings: 0, recent_errors: recentErrors, game: 'running' };
}

function summaryAfter(...statuses: Record<string, unknown>[]): ErrorSummary {
  const summary = new ErrorSummary();
  for (const observed of statuses) {
    summary.observe(1, 'log.status', observed);
  }
  return summary;
}

const speedError = { seq: 12, source: 'game', message: "Invalid access to property 'speed'.", location: 'res://player.gd:12' };

describe('ErrorSummary', () => {
  it('reports nothing before the first status', () => {
    expect(new ErrorSummary().takeSummary()).toBeUndefined();
  });

  it('starts counting from the status received on connection', () => {
    expect(summaryAfter(status(8, 4, [{ ...speedError, seq: 8 }])).takeSummary()).toBeUndefined();
  });

  it('lists a new error once, with its source and place', () => {
    const summary = summaryAfter(status(10, 0), status(12, 1, [speedError]));

    expect(summary.takeSummary()).toBe(
      ["⚠ New error since the last call:", "- in the game: res://player.gd:12: Invalid access to property 'speed'.", 'Read the game output with game_get_output.'].join('\n'),
    );
    expect(summary.takeSummary()).toBeUndefined();
  });

  it('does not send the agent to the game output for editor errors', () => {
    const summary = summaryAfter(status(2, 0), status(3, 1, [{ seq: 3, source: 'editor', message: 'Parse Error: Expected end of statement', location: 'res://enemy.gd:7' }]));

    expect(summary.takeSummary()).toBe(['⚠ New error since the last call:', '- in the editor: res://enemy.gd:7: Parse Error: Expected end of statement.'].join('\n'));
  });

  it('folds repeated errors and says when it shows only the latest ones', () => {
    const repeated = [396, 397, 398, 399, 400].map((seq) => ({ seq, source: 'game', message: 'Boom.', location: 'res://hud.gd:5' }));
    const summary = summaryAfter(status(0, 0), status(400, 240, repeated));

    expect(summary.takeSummary()).toBe(
      ['⚠ 240 new errors since the last call, the latest:', '- in the game: res://hud.gd:5: Boom. (5 times)', 'Read the game output with game_get_output.'].join('\n'),
    );
  });

  it('lists errors from both sources in order', () => {
    const summary = summaryAfter(
      status(0, 0),
      status(5, 2, [
        { seq: 4, source: 'editor', message: 'Parse Error: Unexpected "Indent".', location: 'res://enemy.gd:3' },
        { seq: 5, source: 'game', message: 'Boom.' },
      ]),
    );

    expect(summary.takeSummary()).toBe(
      [
        '⚠ 2 new errors since the last call:',
        '- in the editor: res://enemy.gd:3: Parse Error: Unexpected "Indent".',
        '- in the game: Boom.',
        'Read the game output with game_get_output.',
      ].join('\n'),
    );
  });

  it('does not report errors that a tool already showed', () => {
    const summary = summaryAfter(status(0, 0), status(6, 3, [{ ...speedError, seq: 6 }]));

    summary.acknowledge();

    expect(summary.takeSummary()).toBeUndefined();
  });

  it('leaves out errors that the result of a tool already covers', () => {
    const summary = summaryAfter(
      status(0, 0),
      status(7, 3, [
        { seq: 5, source: 'editor', message: 'Parse Error: Identifier "SPED" not declared in the current scope.', location: 'res://player.gd:15' },
        { seq: 6, source: 'editor', message: 'Failed to load script "res://player.gd" with error "Parse error".', location: 'modules/gdscript/gdscript_resource_format.cpp:50' },
        { ...speedError, seq: 7, location: 'res://enemy.gd:4' },
      ]),
    );

    summary.dismiss((error) => error.source === 'editor');

    expect(summary.takeSummary()).toBe(
      ['⚠ New error since the last call:', "- in the game: res://enemy.gd:4: Invalid access to property 'speed'.", 'Read the game output with game_get_output.'].join('\n'),
    );
  });

  it('reports nothing when the result of a tool covers every new error', () => {
    const summary = summaryAfter(status(0, 0), status(2, 1, [{ ...speedError, seq: 2 }]));

    summary.dismiss(() => true);

    expect(summary.takeSummary()).toBeUndefined();
  });

  it('does not leave out errors that come after the result', () => {
    const summary = summaryAfter(status(0, 0));

    summary.dismiss(() => true);
    summary.observe(1, 'log.status', status(3, 1, [{ ...speedError, seq: 3 }]));

    expect(summary.takeSummary()).toContain("Invalid access to property 'speed'.");
  });

  it('starts over when it connects to another editor', () => {
    const summary = new ErrorSummary();
    summary.observe(1, 'log.status', status(20, 9));
    summary.observe(2, 'log.status', status(3, 1, [{ ...speedError, seq: 3 }]));

    expect(summary.takeSummary()).toBeUndefined();
  });

  it('ignores other notifications and malformed statuses', () => {
    const summary = summaryAfter(status(0, 0));
    summary.observe(1, 'something.else', status(5, 5));
    summary.observe(1, 'log.status', { errors: 'many' });

    expect(summary.takeSummary()).toBeUndefined();
  });
});
