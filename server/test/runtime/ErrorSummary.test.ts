import { describe, expect, it } from 'vitest';
import { ErrorSummary } from '../../src/runtime/ErrorSummary.js';

function status(errors: number, latestError: Record<string, unknown> = {}): Record<string, unknown> {
  return { last_seq: errors * 2, errors, warnings: 0, latest_error: latestError, game: 'running' };
}

describe('ErrorSummary', () => {
  it('reports nothing before the first status', () => {
    expect(new ErrorSummary().takeSummary()).toBeUndefined();
  });

  it('starts counting from the status received on connection', () => {
    const summary = new ErrorSummary();

    summary.observe(1, 'log.status', status(4));

    expect(summary.takeSummary()).toBeUndefined();
  });

  it('reports new errors once with the latest one', () => {
    const summary = new ErrorSummary();
    summary.observe(1, 'log.status', status(4));
    summary.observe(1, 'log.status', status(6, { seq: 12, source: 'game', message: "Invalid access to property 'speed'.", location: 'res://player.gd:12' }));

    expect(summary.takeSummary()).toBe(
      "⚠ 2 new errors since the last call. Latest, in the game: res://player.gd:12: Invalid access to property 'speed'. Read them with game_get_output.",
    );
    expect(summary.takeSummary()).toBeUndefined();
  });

  it('names a single error and its source', () => {
    const summary = new ErrorSummary();
    summary.observe(1, 'log.status', status(0));
    summary.observe(1, 'log.status', status(1, { seq: 3, source: 'editor', message: 'Parse Error: Expected end of statement.', location: 'res://enemy.gd:7' }));

    expect(summary.takeSummary()).toBe(
      '⚠ 1 new error since the last call. Latest, in the editor: res://enemy.gd:7: Parse Error: Expected end of statement. Read them with game_get_output.',
    );
  });

  it('does not report errors that a tool already showed', () => {
    const summary = new ErrorSummary();
    summary.observe(1, 'log.status', status(0));
    summary.observe(1, 'log.status', status(3, { seq: 6, source: 'game', message: 'Boom.' }));

    summary.acknowledge();

    expect(summary.takeSummary()).toBeUndefined();
  });

  it('starts over when it connects to another editor', () => {
    const summary = new ErrorSummary();
    summary.observe(1, 'log.status', status(9));
    summary.observe(2, 'log.status', status(1));

    expect(summary.takeSummary()).toBeUndefined();
  });

  it('ignores other notifications and malformed statuses', () => {
    const summary = new ErrorSummary();
    summary.observe(1, 'log.status', status(0));
    summary.observe(1, 'something.else', status(5));
    summary.observe(1, 'log.status', { errors: 'many' });

    expect(summary.takeSummary()).toBeUndefined();
  });
});
