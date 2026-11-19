import { writeFileSync } from 'node:fs';
import { toneWave } from '../../support/toneWave.js';
import { type CheckResult, checked, type Scenario } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena, writeScripts } from './fixtures.js';

const listeningFrames = 30;

function busLine(text: string, bus: string): string {
  return text.split('\n').find((line) => line.startsWith(`- ${bus}: `)) ?? `- ${bus}: not listed`;
}

export const silenceInTheArena: Scenario = {
  name: 'silence-in-the-arena',
  request: 'The arena should have background music on its Music bus, but nothing can be heard. Find out why and fix it.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    writeFileSync(project.path('music.wav'), toneWave());
    await writeScripts(project, tools, {});
    await tools.call('audio_buses_set', { buses: [{ name: 'Music', volume_db: -6, mute: true }, { name: 'Effects' }] });
    await buildArena(tools, [...arenaOperations(), { op: 'node_add', type: 'AudioStreamPlayer', name: 'Music', properties: { stream: 'res://music.wav', bus: 'Music' } }]);
  },
  async solve({ tools }) {
    await tools.call('audio_buses_set', { buses: [{ name: 'Music', mute: false }] });
    await tools.call('node_set_properties', { scene: arenaScene, path: 'Music', properties: { autoplay: true } });
    await tools.call('scene_save', { scene: arenaScene });
  },
  async check({ tools }) {
    await tools.call('game_run');
    const levels = await tools.call('audio_buses_get', { in_game: true, window_physics_frames: listeningFrames });
    const music = busLine(levels.text, 'Music');
    const master = busLine(levels.text, 'Master');
    const checks: CheckResult[] = [
      checked('the music plays in the running game', levels.text.includes('Playing: Music (AudioStreamPlayer) on Music'), levels.text.split('\n').find((line) => line.startsWith('Playing') || line.startsWith('No player')) ?? ''),
      checked('the Music bus carries sound', music.includes('peak'), music),
      checked('the sound reaches the speakers through Master', master.includes('peak'), master),
    ];
    return checks;
  },
};
