import * as z from 'zod/v4';
import type { McpPrompt, PromptDefinition } from './McpPrompt.js';

const addTestsArguments = z.object({
  script: z.string().min(1).describe('The script to test, as a res:// path, such as res://player/player.gd.'),
});

export class AddTestsPrompt implements McpPrompt<typeof addTestsArguments> {
  readonly name = 'add_tests';

  readonly definition: PromptDefinition<typeof addTestsArguments> = {
    title: 'Add tests',
    description: 'Write tests for one script with the test framework of the project, installing GUT when there is none, and run them with test_run.',
    argsSchema: addTestsArguments,
  };

  render({ script }: z.output<typeof addTestsArguments>): Promise<string> {
    return Promise.resolve(
      [
        `Write tests for ${script} and run them.`,
        '',
        `1. Read ${script}, and find out with resource_find_usages which scenes use it, to learn what it should do.`,
        '2. Use the test framework of the project, GUT (addons/gut) or gdUnit4 (addons/gdUnit4); when it has none, install GUT with test_install_framework.',
        '3. Write one test script for it beside the other tests of the project, such as res://test/test_player.gd extending GutTest, with a test for each behavior that matters: what its public methods return and change, the signals it emits, and its edge cases. With the godot skill, read its testing page first.',
        '4. Check the test script with script_validate and run it with test_run. A failing test is either a wrong test, which you fix, or a bug of the script: report it rather than hide it.',
        '5. Run all the tests of the project with test_run once more.',
        '',
        'Report the tests you wrote, what they cover, and any bug they found.',
      ].join('\n'),
    );
  }
}
