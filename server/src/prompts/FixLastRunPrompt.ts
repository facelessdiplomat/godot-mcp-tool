import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { formatLogEntries, logEntrySchema } from '../tools/formatting/logEntries.js';
import { describeError } from '../util/errors.js';
import type { McpPrompt, PromptDefinition } from './McpPrompt.js';

const noArguments = z.object({});

const errorPageSchema = z.object({ entries: z.array(logEntrySchema) });

const errorLimit = 50;

const fixingSteps = [
  'For each error:',
  '1. Find the cause: read the script at the reported file and line, and the nodes it uses (scene_get_tree, node_get_properties).',
  '2. Fix the cause rather than the symptom; read an engine API you are not sure of with docs_class first.',
  '3. Check every changed script with script_validate.',
  'Then run the game again with game_run and read its output with game_get_output, until a run has no errors. Finish with a short list: each error, its cause and the fix.',
].join('\n');

export class FixLastRunPrompt implements McpPrompt<typeof noArguments> {
  readonly name = 'fix_last_run';

  readonly definition: PromptDefinition<typeof noArguments> = {
    title: 'Fix the last run',
    description: 'Fix the errors of the last game run: hands over the errors with file, line and stack, and the steps to find each cause, fix it, check the scripts and run the game again.',
    argsSchema: noArguments,
  };

  constructor(private readonly game: EditorGateway) {}

  async render(): Promise<string> {
    let errors: z.infer<typeof errorPageSchema>['entries'];
    try {
      errors = errorPageSchema.parse(await this.game.request('game.get_output', { after: -1, levels: ['error'], limit: errorLimit })).entries;
    } catch (error) {
      return [
        `The errors of the last game run could not be read: ${describeError(error)}`,
        'Start the editor with editor_launch or run the game with game_run, read the errors with game_get_output, and fix them.',
        fixingSteps,
      ].join('\n\n');
    }
    if (errors.length === 0) {
      return [
        'The last game run reported no errors. If the game has not run yet, run it with game_run and read its output with game_get_output; fix any error that shows up.',
        fixingSteps,
      ].join('\n\n');
    }
    return ['Fix the errors of the last game run.', `The errors, as game_get_output reports them:\n${formatLogEntries(errors)}`, fixingSteps].join('\n\n');
  }
}
