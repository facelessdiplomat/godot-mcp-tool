import { existsSync } from 'node:fs';
import type { TemporaryProject } from '../../integration/harness.js';
import { type CheckResult, checked, conditionHolds, type Scenario } from '../Scenario.js';
import { arenaScene, buildPrototype } from './fixtures.js';

const defaultLayoutPath = 'res://default_bus_layout.tres';
const layoutSettingPattern = /^buses\/default_bus_layout="(?<path>[^"]+)"$/m;
const busPropertyPattern = /^bus\/(?<index>\d+)\/(?<property>name|volume_db|send) = &?"?(?<value>[^"\n]*)"?$/gm;
const quieterByDb = 6;
const volumeTolerance = 0.01;
const readTimeoutMs = 3_000;

interface Bus {
  name: string;
  volume: number;
  send: string;
}

function busesOf(layoutText: string): Map<string, Bus> {
  const byIndex = new Map<string, Bus>();
  for (const match of layoutText.matchAll(busPropertyPattern)) {
    const { index = '', property = '', value = '' } = match.groups ?? {};
    const bus = byIndex.get(index) ?? { name: '', volume: 0, send: '' };
    if (property === 'name') {
      bus.name = value;
    } else if (property === 'volume_db') {
      bus.volume = Number(value);
    } else {
      bus.send = value;
    }
    byIndex.set(index, bus);
  }
  return new Map([...byIndex.values()].map((bus) => [bus.name, bus]));
}

function layoutTextOf(project: TemporaryProject): string {
  const layoutPath = layoutSettingPattern.exec(project.read('project.godot'))?.groups?.['path'] ?? defaultLayoutPath;
  const relativePath = layoutPath.replace('res://', '');
  return existsSync(project.path(relativePath)) ? project.read(relativePath) : '';
}

export const musicOnItsOwnBus: Scenario = {
  name: 'music-on-its-own-bus',
  request:
    "Add a Music bus and an Effects bus to the project's audio bus layout, both sending to Master, with Music 6 dB quieter than Effects, and play the music on Music and the jump sound on Effects.",
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools, {
      operations: [
        { op: 'node_add', type: 'AudioStreamPlayer', name: 'Music', properties: { stream: { new: 'AudioStreamGenerator' }, autoplay: true } },
        { op: 'node_add', type: 'AudioStreamPlayer3D', name: 'JumpSound', parent: 'Player', properties: { stream: { new: 'AudioStreamGenerator' } } },
      ],
    });
  },
  async solve({ tools }) {
    await tools.call('audio_buses_set', { buses: [{ name: 'Music', volume_db: -quieterByDb }, { name: 'Effects' }] });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'node_set_properties', path: 'Music', properties: { bus: 'Music' } },
        { op: 'node_set_properties', path: 'Player/JumpSound', properties: { bus: 'Effects' } },
      ],
    });
    await tools.call('scene_save', { scene: arenaScene });
  },
  async check({ project, tools }) {
    const buses = busesOf(layoutTextOf(project));
    const music = buses.get('Music');
    const effects = buses.get('Effects');
    const checks: CheckResult[] = [
      checked(
        'the bus layout has a Music bus and an Effects bus, both sending to Master',
        music?.send === 'Master' && effects?.send === 'Master',
        `buses: ${[...buses.values()].map((bus) => `${bus.name} → ${bus.send || 'nothing'}`).join(', ') || 'none'}`,
      ),
      checked(
        'the Music bus is 6 dB quieter than the Effects bus',
        music !== undefined && effects !== undefined && Math.abs(effects.volume - music.volume - quieterByDb) < volumeTolerance,
        `Music ${String(music?.volume ?? '?')} dB, Effects ${String(effects?.volume ?? '?')} dB`,
      ),
    ];
    await tools.call('game_run');
    checks.push(await conditionHolds(tools, 'the music plays on the Music bus', 'Music', 'bus == "Music"', readTimeoutMs));
    checks.push(await conditionHolds(tools, 'the jump sound plays on the Effects bus', 'Player/JumpSound', 'bus == "Effects"', readTimeoutMs));
    return checks;
  },
};
