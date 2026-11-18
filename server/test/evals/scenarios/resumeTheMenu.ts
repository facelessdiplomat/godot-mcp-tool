import { conditionHolds, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype } from './fixtures.js';

const pauseMenuScript = [
  'extends CanvasLayer',
  '',
  '',
  'func _ready() -> void:',
  '\tvisible = false',
  '\t$Buttons/ResumeButton.pressed.connect(_resume)',
  '',
  '',
  'func _unhandled_input(event: InputEvent) -> void:',
  '\tif event.is_action_pressed("pause") and not get_tree().paused:',
  '\t\tget_tree().paused = true',
  '\t\tvisible = true',
  '',
  '',
  'func _resume() -> void:',
  '\tget_tree().paused = false',
  '\tvisible = false',
  '',
].join('\n');

export const resumeTheMenu: Scenario = {
  name: 'resume-the-menu',
  request: 'Clicking Resume in the pause menu does nothing. Find out why and fix it.',
  window: true,
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools, {
      scripts: { 'pause_menu.gd': pauseMenuScript },
      operations: [
        { op: 'node_add', type: 'CanvasLayer', name: 'PauseMenu', properties: { process_mode: 'Always', script: 'res://pause_menu.gd' } },
        { op: 'node_add', type: 'VBoxContainer', name: 'Buttons', parent: 'PauseMenu', properties: { position: [500, 280] } },
        { op: 'node_add', type: 'Button', name: 'ResumeButton', parent: 'PauseMenu/Buttons', properties: { text: 'Resume' } },
        { op: 'node_add', type: 'ColorRect', name: 'Shade', parent: 'PauseMenu', properties: { anchors_preset: 'Full Rect', color: [0, 0, 0, 0.4] } },
      ],
    });
    await tools.call('input_map_set', { actions: { pause: ['Escape'] } });
  },
  async solve({ tools }) {
    await tools.call('node_set_properties', { scene: arenaScene, path: 'PauseMenu/Shade', properties: { mouse_filter: 'Ignore' } });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const checks = [await scriptsAreClean(tools)];
    await tools.call('game_run');
    await tools.call('game_wait', { physics_frames: 20 });
    await tools.call('game_input', { steps: [{ key: 'Escape' }, { wait_ms: 200 }] });
    checks.push(await conditionHolds(tools, 'Escape still opens the menu', '.', 'get_tree().paused', 2_000));
    await tools.call('game_input', { steps: [{ click: 'PauseMenu/Buttons/ResumeButton' }, { wait_ms: 200 }] });
    checks.push(await conditionHolds(tools, 'a click on Resume continues the game', '.', 'not get_tree().paused', 2_000));
    return checks;
  },
};
