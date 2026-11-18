import type { ProjectFile } from '../project/ProjectFiles.js';
import { findCodeFiles } from './ScriptFiles.js';
import { type ScriptReport, type ValidationResult, ValidationUnavailableError } from './ScriptValidator.js';

export interface ScriptFileChecker {
  validate(inputs: readonly string[]): Promise<ValidationResult>;
}

export interface ShaderFileChecker {
  validate(shaders: readonly ProjectFile[]): Promise<ScriptReport[]>;
}

export class CodeValidator {
  constructor(
    private readonly projectRoot: string | undefined,
    private readonly scripts: ScriptFileChecker,
    private readonly shaders: ShaderFileChecker,
  ) {}

  async validate(inputs: readonly string[]): Promise<ValidationResult> {
    if (this.projectRoot === undefined) {
      throw new ValidationUnavailableError('No Godot project was found, so there are no scripts to check. Set GODOT_PROJECT_PATH to the folder with project.godot.');
    }
    const found = findCodeFiles(this.projectRoot, inputs);
    const scriptResult: ValidationResult =
      found.scripts.length > 0 || found.shaders.length === 0
        ? await this.scripts.validate(found.scripts.map((script) => script.resourcePath))
        : { method: 'check-only', reports: [] };
    if (found.shaders.length === 0) {
      return scriptResult;
    }
    return { ...scriptResult, shaderReports: await this.shaders.validate(found.shaders) };
  }
}
