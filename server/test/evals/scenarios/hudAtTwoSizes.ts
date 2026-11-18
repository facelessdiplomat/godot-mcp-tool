import { agentUsed, type CheckResult, checked, type Scenario } from '../Scenario.js';

const hudScenePath = 'res://hud.tscn';

const hudScene = [
  '[gd_scene format=3]',
  '',
  '[node name="Hud" type="Control"]',
  'layout_mode = 3',
  'anchors_preset = 15',
  'anchor_right = 1.0',
  'anchor_bottom = 1.0',
  '',
  '[node name="Health" type="ProgressBar" parent="."]',
  'layout_mode = 0',
  'offset_left = 40.0',
  'offset_top = 780.0',
  'offset_right = 280.0',
  'offset_bottom = 810.0',
  'value = 75.0',
  '',
].join('\n');

export const hudAtTwoSizes: Scenario = {
  name: 'hud-at-two-sizes',
  request: 'Show me the HUD at 16:9 and at 4:3, and make sure the health bar stays on screen at both.',
  window: true,
  projectOptions: { mainScene: hudScenePath },
  async prepare({ project, tools }) {
    project.write('hud.tscn', hudScene);
    await tools.call('project_settings_set', { values: { 'display/window/stretch/mode': 'canvas_items', 'display/window/stretch/aspect': 'expand' } });
    await tools.call('editor_rescan');
    await tools.call('scene_open', { path: hudScenePath });
  },
  async solve({ tools }) {
    await tools.call('editor_screenshot', { sizes: [[1920, 1080], [1440, 1080]] });
    await tools.call('node_set_properties', {
      scene: hudScenePath,
      path: 'Health',
      properties: { anchor_top: 1, anchor_bottom: 1, offset_top: -70, offset_bottom: -40 },
    });
    await tools.call('scene_save');
    await tools.call('editor_screenshot', { sizes: [[1920, 1080], [1440, 1080]] });
  },
  async check({ tools, agent }) {
    const bounds = await tools.call('node_get_bounds', { scene: hudScenePath, path: 'Health' });
    const anchors = await tools.call('node_get_properties', { scene: hudScenePath, path: 'Health', names: ['anchor_top', 'anchor_bottom'] });
    const anchoredBelow = /anchor_top = 1\b/.test(anchors.text) && /anchor_bottom = 1\b/.test(anchors.text);
    const checks: CheckResult[] = [
      checked('the health bar lies inside the window of the project', bounds.text.includes('It lies inside'), bounds.text.split('\n').at(-1) ?? bounds.text),
      checked('the health bar keeps to the bottom edge whatever the height of the window', anchoredBelow, anchors.text.split('\n').slice(1).join('; ')),
    ];
    checks.push(...agentUsed(agent, ['editor_screenshot', 'game_screenshot'], 'the agent showed the HUD at both sizes'));
    return checks;
  },
};
