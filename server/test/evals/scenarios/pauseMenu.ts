import { conditionHolds, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype, writeScripts } from './fixtures.js';

const resumeButton = 'get_tree().root.find_child("*Resume*", true, false)';
const quitButton = 'get_tree().root.find_child("*Quit*", true, false)';

const pauseMenuScript = [
  'extends CanvasLayer',
  '',
  '',
  'func _ready() -> void:',
  '\tvisible = false',
  '\t$Buttons/ResumeButton.pressed.connect(_resume)',
  '\t$Buttons/QuitButton.pressed.connect(get_tree().quit)',
  '',
  '',
  'func _unhandled_input(event: InputEvent) -> void:',
  '\tif event.is_action_pressed("pause"):',
  '\t\tif get_tree().paused:',
  '\t\t\t_resume()',
  '\t\telse:',
  '\t\t\tget_tree().paused = true',
  '\t\t\tvisible = true',
  '',
  '',
  'func _resume() -> void:',
  '\tget_tree().paused = false',
  '\tvisible = false',
  '',
].join('\n');

export const pauseMenu: Scenario = {
  name: 'pause-menu',
  request: 'Add a pause menu: Escape pauses the game and shows Resume and Quit buttons, and Resume continues the game.',
  window: true,
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools);
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'pause_menu.gd': pauseMenuScript });
    await tools.call('input_map_set', { actions: { pause: ['Escape'] } });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'node_add', type: 'CanvasLayer', name: 'PauseMenu', properties: { process_mode: 'Always', script: 'res://pause_menu.gd' } },
        { op: 'node_add', type: 'VBoxContainer', name: 'Buttons', parent: 'PauseMenu', properties: { position: [500, 280] } },
        { op: 'node_add', type: 'Button', name: 'ResumeButton', parent: 'PauseMenu/Buttons', properties: { text: 'Resume' } },
        { op: 'node_add', type: 'Button', name: 'QuitButton', parent: 'PauseMenu/Buttons', properties: { text: 'Quit' } },
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const checks = [await scriptsAreClean(tools)];
    await tools.call('game_run');
    await tools.call('game_wait', { physics_frames: 20 });
    await tools.call('game_input', { steps: [{ key: 'Escape' }, { wait_ms: 200 }] });
    checks.push(
      await conditionHolds(tools, 'Escape pauses the game', '.', 'get_tree().paused', 2_000),
      await conditionHolds(tools, 'the menu shows Resume and Quit', '.', `${resumeButton} != null and ${resumeButton}.is_visible_in_tree() and ${quitButton} != null`, 2_000),
    );
    await tools.call('game_wait', { condition: `${resumeButton}.pressed.emit() == null`, node: '.', timeout_ms: 2_000 });
    checks.push(await conditionHolds(tools, 'Resume continues the game and hides the menu', '.', `not get_tree().paused and not ${resumeButton}.is_visible_in_tree()`, 2_000));
    return checks;
  },
};
