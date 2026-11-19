import { describe, expect, it } from 'vitest';
import type * as z from 'zod/v4';
import { EditorUnavailableError } from '../../src/editor/EditorGateway.js';
import { AddTestsPrompt } from '../../src/prompts/AddTestsPrompt.js';
import { FixLastRunPrompt } from '../../src/prompts/FixLastRunPrompt.js';
import { PlaytestPrompt } from '../../src/prompts/PlaytestPrompt.js';
import { ProfilePrompt } from '../../src/prompts/ProfilePrompt.js';
import { SetupCiPrompt } from '../../src/prompts/SetupCiPrompt.js';
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

describe('profile', () => {
  it('lays out a measurement of the game or of a scene that changes nothing', async () => {
    const prompt = new ProfilePrompt();

    const game = await prompt.render({});
    const arena = await prompt.render({ scene: 'res://levels/arena.tscn' });

    expect(game).toMatch(/^Profile the game and find what makes it slow\. Do not change the project/);
    expect(game).toContain('Run it with game_run.');
    expect(arena).toContain('Run it with game_run and scene: "res://levels/arena.tscn".');
    expect(game).toContain('game_performance');
    expect(game).toContain('function times');
    expect(game).toContain('game_stop');
    expect(game).toContain('without making it');
  });
});

describe('add_tests', () => {
  it('asks for tests of one script with the framework of the project, and runs them', async () => {
    const text = await new AddTestsPrompt().render({ script: 'res://player/player.gd' });

    expect(text).toMatch(/^Write tests for res:\/\/player\/player\.gd and run them\./);
    expect(text).toContain('test_install_framework');
    expect(text).toContain('script_validate');
    expect(text).toContain('test_run');
    expect(text).toContain('report it rather than hide it');
  });

  it('needs the script', () => {
    expect(new AddTestsPrompt().definition.argsSchema.safeParse({}).success).toBe(false);
  });
});

describe('setup_ci', () => {
  it('asks for a GitHub Actions workflow that tests and exports the game, without pushing it', async () => {
    const text = await new SetupCiPrompt().render();

    expect(text).toMatch(/^Set up continuous integration on GitHub Actions for this game/);
    expect(text).toContain('.github/workflows/godot.yml');
    expect(text).toContain('SHA-512');
    expect(text).toContain('export_preset_add');
    expect(text).toContain('Do not push');
  });
});

describe('the arguments of every prompt', () => {
  it('are single words, since Claude Code splits the arguments of a command at spaces', () => {
    const argumentShapes: readonly Readonly<Record<string, z.ZodType>>[] = [
      new PlaytestPrompt().definition.argsSchema.shape,
      new ProfilePrompt().definition.argsSchema.shape,
      new AddTestsPrompt().definition.argsSchema.shape,
      new SetupCiPrompt().definition.argsSchema.shape,
    ];

    for (const shape of argumentShapes) {
      for (const [name, schema] of Object.entries(shape)) {
        expect(name).toMatch(/^[a-z]+$/);
        expect(schema.description?.length ?? 0).toBeGreaterThan(10);
      }
    }
  });
});
