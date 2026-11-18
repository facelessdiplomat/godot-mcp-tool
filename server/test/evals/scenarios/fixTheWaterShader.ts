import { agentUsed, type CheckResult, checked, type Scenario } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena, writeScripts } from './fixtures.js';

const shaderPath = 'res://water.gdshader';
const uniformsOfTheMaterial = ['uniform float wave_height', 'uniform float wave_length', 'uniform vec3 water_color'];

function waterShader(secondWaveLine: string, albedoLine: string): string {
  return [
    'shader_type spatial;',
    '',
    'uniform float wave_height = 0.2;',
    'uniform float wave_length = 2.0;',
    'uniform vec3 water_color : source_color = vec3(0.1, 0.4, 0.7);',
    '',
    'void vertex() {',
    '\tfloat first_wave = sin(VERTEX.x * wave_length + TIME);',
    secondWaveLine,
    '\tVERTEX.y += (first_wave + second_wave) * wave_height;',
    '}',
    '',
    'void fragment() {',
    albedoLine,
    '\tROUGHNESS = 0.1;',
    '}',
    '',
  ].join('\n');
}

const workingShader = waterShader('\tfloat second_wave = cos(VERTEX.z * wave_length * 0.5 + TIME * 1.3);', '\tALBEDO = water_color;');
const brokenShader = waterShader('\tfloat second_wave = cos(VERTEX.z * wave_length * 0.5 + TIME * 1.3)', '\tALBEDO = vec4(water_color, 1.0);');

export const fixTheWaterShader: Scenario = {
  name: 'fix-the-water-shader',
  request: 'The water in the arena pool stopped moving after I edited its shader, and Godot prints shader errors. Fix the shader so that the waves move again.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, { 'water.gdshader': workingShader });
    await buildArena(tools, [
      ...arenaOperations(),
      {
        op: 'node_add',
        type: 'MeshInstance3D',
        name: 'Pool',
        properties: {
          position: [0, 0.05, 0],
          mesh: { new: 'PlaneMesh', size: [8, 8], subdivide_width: 32, subdivide_depth: 32 },
          material_override: { new: 'ShaderMaterial', shader: shaderPath },
        },
      },
    ]);
    await writeScripts(project, tools, { 'water.gdshader': brokenShader });
  },
  async solve({ project, tools }) {
    await tools.call('script_validate', { paths: [shaderPath] });
    project.write('water.gdshader', workingShader);
    await tools.call('editor_rescan');
    await tools.call('script_validate', { paths: [shaderPath] });
  },
  async check({ project, tools, agent }) {
    const compiled = await tools.call('script_validate', { paths: [shaderPath] });
    const shader = project.read('water.gdshader');
    const vertexBody = /void vertex\(\)\s*\{(?<body>[^}]*)\}/.exec(shader)?.groups?.['body'] ?? '';
    const keptUniforms = uniformsOfTheMaterial.filter((uniform) => shader.includes(uniform));
    const checks: CheckResult[] = [
      checked('the water shader compiles', !compiled.isError && compiled.text.startsWith('No problems'), compiled.text.split('\n').slice(0, 3).join(' ')),
      checked('the shader keeps the uniforms of its material', keptUniforms.length === uniformsOfTheMaterial.length, keptUniforms.length === 0 ? 'none of them' : keptUniforms.join(', ')),
      checked('the vertex function still moves the water up and down with TIME', /VERTEX\.y/.test(vertexBody) && /\bTIME\b/.test(vertexBody), vertexBody.trim().replace(/\s+/g, ' ')),
    ];
    await tools.call('game_run');
    const errors = await tools.call('game_get_output', { levels: ['error'] });
    checks.push(checked('the game runs without errors', !/^- /m.test(errors.text), errors.text.split('\n')[0] ?? ''));
    checks.push(...agentUsed(agent, ['script_validate'], 'the agent compiled the shader with script_validate'));
    return checks;
  },
};
