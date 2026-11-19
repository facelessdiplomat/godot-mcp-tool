import * as z from 'zod/v4';
import type { McpPrompt, PromptDefinition } from './McpPrompt.js';

const profileArguments = z.object({
  scene: z.string().optional().describe('The scene to profile, as a res:// path. Default: the main scene.'),
});

export class ProfilePrompt implements McpPrompt<typeof profileArguments> {
  readonly name = 'profile';

  readonly definition: PromptDefinition<typeof profileArguments> = {
    title: 'Profile',
    description: 'Profile the game, or one scene of it, with game_performance and the function times of its scripts, and name the slowest part with a fix, without changing the project.',
    argsSchema: profileArguments,
  };

  render({ scene }: z.output<typeof profileArguments>): Promise<string> {
    const subject = scene === undefined ? 'the game' : scene;
    const run = scene === undefined ? 'Run it with game_run.' : `Run it with game_run and scene: "${scene}".`;
    return Promise.resolve(
      [
        `Profile ${subject} and find what makes it slow. Do not change the project while you measure.`,
        '',
        `1. ${run} Read any errors with game_get_output.`,
        '2. Bring it to its usual load: play it with game_input as a player would, with movement and the main actions, or wait with game_wait where the load builds up by itself, such as enemies that spawn over time.',
        '3. Measure with game_performance over a few hundred frames while it plays: frame time and FPS, process and physics time, draw calls, objects and nodes, and the function times of the scripts, which a game started from the editor reports with their files and lines.',
        '4. Find the slowest part: the script function that takes the most time of its own, or the kind of work that dominates, such as rendering when draw calls are high, physics when the physics time is, or a leak when objects or orphan nodes keep growing between two measurements. Read its code at the file and line given.',
        '5. Stop the game with game_stop.',
        '',
        'Report the numbers, the slowest part with its share of the frame time, its cause, and the fix you suggest with the gain you expect, without making it.',
      ].join('\n'),
    );
  }
}
