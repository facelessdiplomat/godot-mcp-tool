import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { ErrorDismissal } from '../runtime/ErrorSummary.js';
import { ScriptPathError } from '../scripts/ScriptFiles.js';
import { isLoadErrorOf, isShaderErrorOf } from '../scripts/ScriptLoadErrors.js';
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
      'Scripts, shaders or folders to check, as res:// paths or paths in the project, such as ["res://player/player.gd"], ["res://shaders/water.gdshader"] or ["res://player/"]. Folders are searched for .gd and .gdshader files; addons are skipped unless named.',
    ),
});

export class ScriptValidateTool implements Tool<typeof scriptValidateInput> {
  readonly name = 'script_validate';

  readonly definition: ToolDefinition<typeof scriptValidateInput> = {
    title: 'Check scripts',
    description:
      "Check GDScript files for errors and warnings without running the game, as the Godot editor does: syntax, types, unknown identifiers, unused variables; and compile .gdshader files with Godot's shader compiler, which reports the first error of each shader with its line, also inside included files. Call it after writing or changing .gd or .gdshader files, before game_run. Scripts are checked with the editor's language server, or godot --check-only when the editor is not connected; shaders in the editor, or in Godot without a window.",
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
      this.editorErrors.dismiss(isShaderErrorOf(validation.shaderReports ?? []));
      return textResult(formatValidation(validation));
    } catch (error) {
      if (error instanceof ScriptPathError || error instanceof ValidationUnavailableError) {
        return errorResult(error.message);
      }
      throw error;
    }
  }
}
