import { conditionHolds, type Scenario } from '../Scenario.js';

const menuScene = 'res://menu.tscn';
const readTimeoutMs = 3_000;
const translations = ['keys,en,de', 'Start,Start,Starten', 'Quit,Quit,Beenden', ''].join('\n');

export const translateTheMenu: Scenario = {
  name: 'translate-the-menu',
  request: 'Translate the main menu into German: when the game runs in German, its Start button should read Starten and its Quit button Beenden.',
  projectOptions: { mainScene: menuScene },
  async prepare({ tools }) {
    await tools.call('scene_create', { path: menuScene, root_type: 'Control' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_set_properties', path: '.', properties: { anchors_preset: 'Full Rect' } },
        { op: 'node_add', type: 'VBoxContainer', name: 'Buttons', properties: { anchors_preset: 'Center' } },
        { op: 'node_add', type: 'Button', name: 'Start', parent: 'Buttons', properties: { text: 'Start' } },
        { op: 'node_add', type: 'Button', name: 'Quit', parent: 'Buttons', properties: { text: 'Quit' } },
      ],
    });
    await tools.call('scene_save');
  },
  async solve({ project, tools }) {
    project.write('translations.csv', translations);
    await tools.call('editor_rescan');
    await tools.call('project_settings_set', {
      values: { 'internationalization/locale/translations': ['res://translations.en.translation', 'res://translations.de.translation'] },
    });
  },
  async check({ tools }) {
    await tools.call('game_run', { locale: 'de' });
    const german = [
      await conditionHolds(tools, 'the Start button reads Starten in German', 'Buttons/Start', 'atr(text) == "Starten"', readTimeoutMs),
      await conditionHolds(tools, 'the Quit button reads Beenden in German', 'Buttons/Quit', 'atr(text) == "Beenden"', readTimeoutMs),
    ];
    await tools.call('game_run', { locale: 'en' });
    const english = await conditionHolds(tools, 'the Start button still reads Start in English', 'Buttons/Start', 'atr(text) == "Start"', readTimeoutMs);
    return [...german, english];
  },
};
