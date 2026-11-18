import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import type { ProjectFile } from '../project/ProjectFiles.js';
import type { ScriptProblem } from './ScriptProblem.js';
import type { ScriptReport } from './ScriptValidator.js';

const shaderValidationSchema = z.object({
  shaders: z.array(z.object({ path: z.string(), problems: z.array(z.object({ file: z.string(), line: z.number().int(), message: z.string() })) })),
});

const compileTimeoutMs = 120_000;

export class ShaderValidator {
  constructor(private readonly godot: EditorGateway) {}

  async validate(shaders: readonly ProjectFile[]): Promise<ScriptReport[]> {
    const response = shaderValidationSchema.parse(
      await this.godot.request('shader.validate', { paths: shaders.map((shader) => shader.resourcePath) }, { timeoutMs: compileTimeoutMs }),
    );
    return response.shaders.map((shader) => ({
      resourcePath: shader.path,
      problems: shader.problems.map(
        (problem): ScriptProblem => ({
          ...(problem.file === shader.path ? {} : { file: problem.file }),
          line: problem.line,
          severity: 'error',
          message: problem.message,
        }),
      ),
    }));
  }
}
