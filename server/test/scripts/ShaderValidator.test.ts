import { describe, expect, it } from 'vitest';
import { ShaderValidator } from '../../src/scripts/ShaderValidator.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

describe('ShaderValidator', () => {
  it('compiles the shaders in Godot and reports the first error of each with its place', async () => {
    const godot = new FakeEditorGateway().respondTo('shader.validate', {
      shaders: [
        { path: 'res://shaders/water.gdshader', problems: [{ file: 'res://shaders/water.gdshader', line: 4, message: 'Invalid arguments for the built-in function: "vec3(float,float)".' }] },
        { path: 'res://shaders/lit.gdshader', problems: [{ file: 'res://shaders/colors.gdshaderinc', line: 2, message: 'Expected a ";".' }] },
        { path: 'res://shaders/sky.gdshader', problems: [] },
      ],
    });

    const reports = await new ShaderValidator(godot).validate([
      { resourcePath: 'res://shaders/water.gdshader', absolutePath: '/project/shaders/water.gdshader' },
      { resourcePath: 'res://shaders/lit.gdshader', absolutePath: '/project/shaders/lit.gdshader' },
      { resourcePath: 'res://shaders/sky.gdshader', absolutePath: '/project/shaders/sky.gdshader' },
    ]);

    expect(godot.requests[0]?.params).toEqual({ paths: ['res://shaders/water.gdshader', 'res://shaders/lit.gdshader', 'res://shaders/sky.gdshader'] });
    expect(reports).toEqual([
      { resourcePath: 'res://shaders/water.gdshader', problems: [{ line: 4, severity: 'error', message: 'Invalid arguments for the built-in function: "vec3(float,float)".' }] },
      { resourcePath: 'res://shaders/lit.gdshader', problems: [{ file: 'res://shaders/colors.gdshaderinc', line: 2, severity: 'error', message: 'Expected a ";".' }] },
      { resourcePath: 'res://shaders/sky.gdshader', problems: [] },
    ]);
  });
});
