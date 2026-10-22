import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { ErrorDismissal } from '../runtime/ErrorSummary.js';
import { ScriptPathError } from '../scripts/ScriptFiles.js';
import { isLoadErrorOf } from '../scripts/ScriptLoadErrors.js';
import { type ValidationResult, ValidationUnavailableError } from '../scripts/ScriptValidator.js';
import { readingAnnotations } from './annotations.js';
import { formatValidation } from './formatting/scriptReports.js';
import { errorResult, textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

export interface ScriptChecker {
  validate(inputs: readonly string[]): Promise<ValidationResult>;
}

const scriptValidateInput = z.object({
  paths: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'Scripts or folders to check, as res:// paths or paths in the project, such as ["res://player/player.gd"] or ["res://player/"]. Folders are searched for .gd files; addons are skipped unless named.',
    ),
});

export class ScriptValidateTool implements Tool<typeof scriptValidateInput> {
  readonly name = 'script_validate';

  readonly definition: ToolDefinition<typeof scriptValidateInput> = {
    title: 'Check scripts',
    description:
      "Check GDScript files for errors and warnings without running the game, as the Godot editor does: syntax, types, unknown identifiers, unused variables. Call it after writing or changing .gd files, before game_run. Uses the editor's language server, or godot --check-only when the editor is not connected.",
    inputSchema: scriptValidateInput,
    annotations: readingAnnotations,
    alwaysLoad: true,
  };

  constructor(
    private readonly checker: ScriptChecker,
    private readonly editorErrors: ErrorDismissal,
  ) {}

  async execute(input: z.input<typeof scriptValidateInput>): Promise<CallToolResult> {
    const parsedInput = scriptValidateInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    try {
      const validation = await this.checker.validate(parsedInput.data.paths);
      this.editorErrors.dismiss(isLoadErrorOf(validation.reports.map((report) => report.resourcePath)));
      return textResult(formatValidation(validation));
    } catch (error) {
      if (error instanceof ScriptPathError || error instanceof ValidationUnavailableError) {
        return errorResult(error.message);
      }
      throw error;
    }
  }
}
