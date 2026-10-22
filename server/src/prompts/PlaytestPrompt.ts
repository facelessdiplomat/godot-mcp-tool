import * as z from 'zod/v4';
import type { McpPrompt, PromptDefinition } from './McpPrompt.js';

const playtestArguments = z.object({
  scene: z.string().optional().describe('The scene to playtest, as a res:// path. Default: the main scene.'),
});

export class PlaytestPrompt implements McpPrompt<typeof playtestArguments> {
  readonly name = 'playtest';

  readonly definition: PromptDefinition<typeof playtestArguments> = {
    title: 'Playtest',
    description: 'Playtest the game, or one scene of it, through the game tools and report what works, what does not, the errors and the performance, without changing the project.',
    argsSchema: playtestArguments,
  };

  render({ scene }: z.output<typeof playtestArguments>): Promise<string> {
    const subject = scene === undefined ? 'the game' : scene;
    const run = scene === undefined ? 'Run it with game_run.' : `Run it with game_run and scene: "${scene}".`;
    return Promise.resolve(
      [
        `Playtest ${subject} and report what you find. Do not change the project while you test.`,
        '',
        '1. Learn what the player can do: the input actions with input_map_get and the nodes with scene_get_tree.',
        `2. ${run} Read any errors with game_get_output.`,
        '3. Look at it with game_screenshot; for 3D, add views from several angles, such as ["front", "top", "iso"].',
        '4. Play it: drive each input action with game_input (hold movement for some physics frames, press jump and the other actions), wait for results with game_wait, and check positions and states with game_get_properties. Look at fast moments frame by frame with game_pause and game_step.',
        '5. Measure it with game_performance, then stop it with game_stop.',
        '',
        'Report what works and what does not, with numbers and screenshots, the errors and warnings, and the performance, then suggest the most important fixes.',
      ].join('\n'),
    );
  }
}
