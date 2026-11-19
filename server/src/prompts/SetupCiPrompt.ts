import * as z from 'zod/v4';
import type { McpPrompt, PromptDefinition } from './McpPrompt.js';

const noArguments = z.object({});

export class SetupCiPrompt implements McpPrompt<typeof noArguments> {
  readonly name = 'setup_ci';

  readonly definition: PromptDefinition<typeof noArguments> = {
    title: 'Set up CI',
    description: 'Write a GitHub Actions workflow that downloads the official Godot build with its checksum, imports the project, runs its tests as test_run does and exports a build.',
    argsSchema: noArguments,
  };

  render(): Promise<string> {
    return Promise.resolve(
      [
        'Set up continuous integration on GitHub Actions for this game: a workflow, .github/workflows/godot.yml, that on every push and pull request downloads the official Godot build of the version the project uses, checks it against its SHA-512 sum, imports the project, runs its tests the way test_run does, and exports a build that it keeps as an artifact.',
        '',
        '1. Learn the Godot version with godot_status, the test framework from the addons folder (GUT or gdUnit4), and the export presets in export_presets.cfg. Without a preset for Linux, add one with export_preset_add; export_presets.cfg must be committed, without passwords or keys in it.',
        '2. Write the workflow. With the godot skill, start from the workflow of its CI page.',
        '3. Pin what the workflow downloads: the Godot archive by its SHA-512 sum from SHA512-SUMS.txt of the release, and the actions by version.',
        '4. Run the same commands locally where you can: the import, and the tests with test_run.',
        '',
        'Do not push or open a pull request. Tell the user what the workflow does, what it downloads, and what to look at in its first run.',
      ].join('\n'),
    );
  }
}
