import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type CheckResult, checked, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype, writeScripts } from './fixtures.js';

const name = 'keep-the-best-score';
const projectName = `Eval ${name}`;
const saveFileName = 'save.json';
const lowestTestScore = 1000;
const testScoreRange = 9000;

const scoreScript = ['extends Node', '', 'var best := 0', ''].join('\n');

const savingScoreScript = [
  'extends Node',
  '',
  'const SAVE_PATH := "user://save.json"',
  '',
  'var best := 0:',
  '\tset(value):',
  '\t\tbest = value',
  '\t\t_save()',
  '',
  '',
  'func _ready() -> void:',
  '\tif FileAccess.file_exists(SAVE_PATH):',
  '\t\tvar saved: Variant = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))',
  '\t\tif saved is Dictionary:',
  '\t\t\tbest = int((saved as Dictionary).get("best", 0))',
  '',
  '',
  'func _save() -> void:',
  '\tvar file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)',
  '\tif file != null:',
  '\t\tfile.store_string(JSON.stringify({"best": best}))',
  '',
].join('\n');

function userDataFolder(): string {
  switch (process.platform) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'Godot', 'app_userdata', projectName);
    case 'win32':
      return join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), 'Godot', 'app_userdata', projectName);
    default:
      return join(process.env['XDG_DATA_HOME'] ?? join(homedir(), '.local', 'share'), 'godot', 'app_userdata', projectName);
  }
}

export const keepTheBestScore: Scenario = {
  name,
  request: 'The best score in the Score autoload goes back to 0 every time the game starts. Save it to user://save.json whenever it changes and load it when the game starts.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools, { scripts: { 'score.gd': scoreScript } });
    await tools.call('autoload_add', { name: 'Score', path: 'res://score.gd' });
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'score.gd': savingScoreScript });
  },
  async check({ tools }) {
    const best = lowestTestScore + Math.floor(Math.random() * testScoreRange);
    const checks: CheckResult[] = [await scriptsAreClean(tools)];
    await tools.call('game_run');
    const set = await tools.call('game_set_properties', { path: '/root/Score', properties: { best } });
    await tools.call('game_stop');
    await tools.call('game_run');
    const loaded = await tools.call('game_get_properties', { path: '/root/Score', names: ['best'] });
    checks.push(
      checked('the best score set in one run is there in the next', !set.isError && loaded.text.includes(`best = ${String(best)}`), loaded.text.split('\n').slice(0, 2).join(' ')),
    );
    const saveFile = join(userDataFolder(), saveFileName);
    const saved = existsSync(saveFile) ? readFileSync(saveFile, 'utf8') : '';
    checks.push(checked('user://save.json holds the best score', saved.includes(String(best)), saved === '' ? 'there is no user://save.json' : saved.slice(0, 120)));
    return checks;
  },
};
