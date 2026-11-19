import { type CheckResult, checked, conditionHolds, type Scenario } from '../Scenario.js';

const menuScene = 'res://menu.tscn';
const themePath = 'res://ui/menu_theme.tres';
const defaultFontSize = 16;
const readTimeoutMs = 2_000;

const normalStyle = 'get_theme_stylebox("normal")';

const menuOperations = [
  { op: 'node_set_properties', path: '.', properties: { anchors_preset: 'Full Rect' } },
  { op: 'node_add', type: 'ColorRect', name: 'Background', properties: { anchors_preset: 'Full Rect', color: '#3a4a5a' } },
  { op: 'node_add', type: 'VBoxContainer', name: 'Buttons', properties: { anchors_preset: 'Center', custom_minimum_size: [240, 0] } },
  { op: 'node_add', type: 'Button', name: 'Play', parent: 'Buttons', properties: { text: 'Play' } },
  { op: 'node_add', type: 'Button', name: 'Options', parent: 'Buttons', properties: { text: 'Options' } },
  { op: 'node_add', type: 'Button', name: 'Quit', parent: 'Buttons', properties: { text: 'Quit' } },
];

function lookOfButton(button: string): string[] {
  return [
    `${normalStyle}.get_class() == "StyleBoxFlat" and ${normalStyle}.corner_radius_top_left >= 4 and ${normalStyle}.corner_radius_bottom_right >= 4`,
    `${normalStyle}.get_class() == "StyleBoxFlat" and ${normalStyle}.bg_color.get_luminance() < 0.3`,
    `get_theme_font_size("font_size") > ${String(defaultFontSize)}`,
  ].map((condition) => `${button}\n${condition}`);
}

export const skinTheMenu: Scenario = {
  name: 'skin-the-menu',
  request:
    'Give the main menu one look: a Theme with dark buttons that have rounded corners and a larger font, used by the whole menu. Save the theme as res://ui/menu_theme.tres.',
  projectOptions: { mainScene: menuScene },
  async prepare({ tools }) {
    await tools.call('scene_create', { path: menuScene, root_type: 'Control', root_name: 'Menu' });
    await tools.call('scene_batch_edit', { operations: menuOperations });
    await tools.call('scene_save');
  },
  async solve({ tools }) {
    await tools.call('resource_create', {
      path: themePath,
      type: 'Theme',
      properties: {
        'Button/styles/normal': { new: 'StyleBoxFlat', bg_color: '#1e2228', corner_radius_top_left: 10, corner_radius_top_right: 10, corner_radius_bottom_left: 10, corner_radius_bottom_right: 10 },
        'Button/styles/hover': { new: 'StyleBoxFlat', bg_color: '#2b313a', corner_radius_top_left: 10, corner_radius_top_right: 10, corner_radius_bottom_left: 10, corner_radius_bottom_right: 10 },
        'Button/styles/pressed': { new: 'StyleBoxFlat', bg_color: '#14171b', corner_radius_top_left: 10, corner_radius_top_right: 10, corner_radius_bottom_left: 10, corner_radius_bottom_right: 10 },
        'Button/font_sizes/font_size': 24,
        'Button/colors/font_color': '#f0f0f0',
      },
    });
    await tools.call('node_set_properties', { scene: menuScene, path: '.', properties: { theme: themePath } });
    await tools.call('scene_save', { scene: menuScene });
  },
  async check({ tools }) {
    const theme = await tools.call('resource_get', { path: themePath });
    const root = await tools.call('node_get_properties', { scene: menuScene, path: '.', names: ['theme'] });
    const checks: CheckResult[] = [
      checked('the theme is saved as res://ui/menu_theme.tres', !theme.isError && theme.text.includes('Theme'), theme.text.split('\n')[0] ?? ''),
      checked('the root control of the menu uses the theme', root.text.includes(themePath), root.text.split('\n').at(-1) ?? ''),
    ];
    await tools.call('game_run');
    const names = ['the Play button has rounded corners', 'the Play button is dark', 'the Play button has a larger font', 'the Quit button has rounded corners', 'the Quit button is dark', 'the Quit button has a larger font'];
    const conditions = [...lookOfButton('Buttons/Play'), ...lookOfButton('Buttons/Quit')];
    for (const [index, nodeAndCondition] of conditions.entries()) {
      const [node = '', condition = ''] = nodeAndCondition.split('\n');
      checks.push(await conditionHolds(tools, names[index] ?? condition, node, condition, readTimeoutMs));
    }
    return checks;
  },
};
