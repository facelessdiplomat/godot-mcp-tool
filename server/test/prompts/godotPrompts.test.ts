import { describe, expect, it } from 'vitest';
import { EditorUnavailableError } from '../../src/editor/EditorGateway.js';
import { FixLastRunPrompt } from '../../src/prompts/FixLastRunPrompt.js';
import { PlaytestPrompt } from '../../src/prompts/PlaytestPrompt.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

const errorPage = {
  entries: [
    {
      seq: 7,
      source: 'game',
      level: 'error',
      message: "Invalid access to property or key 'speed' on a base object of type 'Nil'.",
      location: 'res://player.gd:12',
    },
  ],
  more: false,
  next_after: 7,
  skipped: 0,
  last_seq: 7,
  state: 'stopped',
};

describe('fix_last_run', () => {
  it('hands over the errors of the last run with the steps to fix them', async () => {
    const game = new FakeEditorGateway().respondTo('game.get_output', errorPage);

    const text = await new FixLastRunPrompt(game).render();

    expect(game.requests[0]?.params).toEqual({ after: -1, levels: ['error'], limit: 50 });
    expect(text).toContain('Fix the errors of the last game run.');
    expect(text).toContain("res://player.gd:12: Invalid access to property or key 'speed'");
    expect(text).toContain('script_validate');
    expect(text).toContain('until a run has no errors');
  });

  it('says when the last run had no errors', async () => {
    const game = new FakeEditorGateway().respondTo('game.get_output', { ...errorPage, entries: [] });

    expect(await new FixLastRunPrompt(game).render()).toMatch(/^The last game run reported no errors\./);
  });

  it('explains why it could not read the errors', async () => {
    const game = new FakeEditorGateway().respondTo('game.get_output', new EditorUnavailableError('The Godot editor is not running for this project.'));

    expect(await new FixLastRunPrompt(game).render()).toMatch(/^The errors of the last game run could not be read: The Godot editor is not running for this project\./);
  });
});

describe('playtest', () => {
  it('lays out a playtest of the main scene or of a given scene', async () => {
    const prompt = new PlaytestPrompt();

    const mainScene = await prompt.render({});
    const arena = await prompt.render({ scene: 'res://levels/arena.tscn' });

    expect(mainScene).toMatch(/^Playtest the game and report what you find\./);
    expect(mainScene).toContain('Run it with game_run.');
    expect(arena).toMatch(/^Playtest res:\/\/levels\/arena\.tscn and report what you find\./);
    expect(arena).toContain('Run it with game_run and scene: "res://levels/arena.tscn".');
    expect(arena).toContain('game_input');
    expect(arena).toContain('game_performance');
  });
});
