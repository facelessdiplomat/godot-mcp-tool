import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodeValidator } from '../../src/scripts/CodeValidator.js';
import type { ScriptFile } from '../../src/scripts/ScriptFiles.js';
import type { ScriptReport, ValidationResult } from '../../src/scripts/ScriptValidator.js';
import { ValidationUnavailableError } from '../../src/scripts/ScriptValidator.js';

describe('CodeValidator', () => {
  let root: string;
  const scriptInputs: string[][] = [];
  const shaderInputs: string[][] = [];
  const scripts = {
    validate: (inputs: readonly string[]): Promise<ValidationResult> => {
      scriptInputs.push([...inputs]);
      return Promise.resolve({ method: 'language server', reports: inputs.map((resourcePath) => ({ resourcePath, problems: [] })) });
    },
  };
  const shaders = {
    validate: (files: readonly ScriptFile[]): Promise<ScriptReport[]> => {
      shaderInputs.push(files.map((file) => file.resourcePath));
      return Promise.resolve(files.map((file) => ({ resourcePath: file.resourcePath, problems: [] })));
    },
  };

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'code-validator-')));
    mkdirSync(join(root, 'shaders'));
    writeFileSync(join(root, 'player.gd'), 'extends Node\n');
    writeFileSync(join(root, 'shaders', 'water.gdshader'), 'shader_type spatial;\n');
    scriptInputs.length = 0;
    shaderInputs.length = 0;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('checks scripts with the script validator and shaders with the shader compiler', async () => {
    const result = await new CodeValidator(root, scripts, shaders).validate(['res://']);

    expect(scriptInputs).toEqual([['res://player.gd']]);
    expect(shaderInputs).toEqual([['res://shaders/water.gdshader']]);
    expect(result.reports).toEqual([{ resourcePath: 'res://player.gd', problems: [] }]);
    expect(result.shaderReports).toEqual([{ resourcePath: 'res://shaders/water.gdshader', problems: [] }]);
  });

  it('asks only the checkers that have files to check', async () => {
    const result = await new CodeValidator(root, scripts, shaders).validate(['res://shaders/water.gdshader']);

    expect(scriptInputs).toEqual([]);
    expect(result.reports).toEqual([]);
    expect(result.shaderReports).toHaveLength(1);
  });

  it('needs a project', async () => {
    await expect(new CodeValidator(undefined, scripts, shaders).validate(['res://player.gd'])).rejects.toThrow(ValidationUnavailableError);
  });
});
