import { dirname } from 'node:path';
import * as z from 'zod/v4';
import { ProjectLocator } from '../project/ProjectLocator.js';
import { ScriptPathError } from '../scripts/ScriptFiles.js';
import { type ValidationResult, ValidationUnavailableError } from '../scripts/ScriptValidator.js';
import { formatValidation } from '../tools/formatting/scriptReports.js';

export type EditedScriptOutcome = { readonly kind: 'silent' } | { readonly kind: 'problems'; readonly hasErrors: boolean; readonly report: string };

export type ScriptValidation = (projectRoot: string, scriptPath: string) => Promise<ValidationResult>;

const scriptExtension = '.gd';
const silent: EditedScriptOutcome = { kind: 'silent' };
const fileEditSchema = z.object({ tool_input: z.object({ file_path: z.string().min(1) }) });

export class EditedScriptCheck {
  constructor(private readonly validate: ScriptValidation) {}

  async check(hookInput: unknown): Promise<EditedScriptOutcome> {
    const edit = fileEditSchema.safeParse(hookInput);
    if (!edit.success || !edit.data.tool_input.file_path.endsWith(scriptExtension)) {
      return silent;
    }
    const scriptPath = edit.data.tool_input.file_path;
    const project = new ProjectLocator({}, dirname(scriptPath)).locate();
    if (!project.found) {
      return silent;
    }
    let validation: ValidationResult;
    try {
      validation = await this.validate(project.root, scriptPath);
    } catch (error) {
      if (error instanceof ValidationUnavailableError || error instanceof ScriptPathError) {
        return silent;
      }
      throw error;
    }
    const problems = validation.reports.flatMap((report) => report.problems);
    if (problems.length === 0) {
      return silent;
    }
    return { kind: 'problems', hasErrors: problems.some((problem) => problem.severity === 'error'), report: formatValidation(validation) };
  }
}
