import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

const audioBusSchema = z.object({
  name: z.string(),
  volume_db: z.number(),
  send: z.string(),
  mute: z.boolean(),
  solo: z.boolean(),
  bypass_effects: z.boolean(),
  effects: z.array(z.object({ type: z.string(), enabled: z.boolean() })),
});

type AudioBus = z.infer<typeof audioBusSchema>;

const audioBusesSchema = z.object({ layout: z.string(), saved: z.boolean(), buses: z.array(audioBusSchema) });

type AudioBuses = z.infer<typeof audioBusesSchema>;

const audioBusLevelSchema = z.object({
  name: z.string(),
  volume_db: z.number(),
  send: z.string(),
  mute: z.boolean(),
  solo: z.boolean(),
  highest_peak_db: z.number(),
  silent: z.boolean(),
});

type AudioBusLevel = z.infer<typeof audioBusLevelSchema>;

const playingPlayerSchema = z.object({ path: z.string(), type: z.string(), bus: z.string(), stream: z.string(), volume_db: z.number() });
const idlePlayerSchema = z.object({ path: z.string(), type: z.string(), bus: z.string(), autoplay: z.boolean() });

type PlayingPlayer = z.infer<typeof playingPlayerSchema>;
type IdlePlayer = z.infer<typeof idlePlayerSchema>;

const audioLevelsSchema = z.object({
  scene: z.string(),
  window_physics_frames: z.number().int(),
  silence_below_db: z.number(),
  buses: z.array(audioBusLevelSchema),
  players: z.array(playingPlayerSchema),
  idle_players: z.array(idlePlayerSchema),
});

type AudioLevels = z.infer<typeof audioLevelsSchema>;

const defaultListeningFrames = 30;
const longestListeningFrames = 600;

const audioBusesGetInput = z.object({
  in_game: z
    .boolean()
    .default(false)
    .describe(
      'Listen to the running game instead: the loudest peak of each bus over a few physics frames, whether that is silence, and the players that are playing, with their bus and stream. Works with or without the editor.',
    ),
  window_physics_frames: z
    .number()
    .int()
    .min(1)
    .max(longestListeningFrames)
    .default(defaultListeningFrames)
    .describe(`With in_game, how long to listen, in physics frames (60 per second by default). Default: ${String(defaultListeningFrames)}.`),
});

const audioBusesGetDescription =
  'Read the audio bus layout of the project, as the Audio panel of the editor shows it: each bus in order with its volume in dB, the bus it sends to, mute, solo, bypass and its effects, and the file the layout is saved in. Players such as AudioStreamPlayer pick a bus by name with their "bus" property. Works without the editor. With in_game, listen to the running game: the level of each bus and the players that play, to tell a muted bus, a silent volume or a player that never starts from a sound that plays.';

export function createAudioBusesGetTool(projectReader: EditorGateway, game: EditorGateway): Tool<typeof audioBusesGetInput> {
  const definition: ToolDefinition<typeof audioBusesGetInput> = {
    title: 'Read audio buses',
    description: audioBusesGetDescription,
    inputSchema: audioBusesGetInput,
    annotations: readingAnnotations,
    alwaysLoad: false,
  };
  const layoutReader = new BridgeTool(projectReader, {
    name: 'audio_buses_get',
    definition,
    method: 'audio.buses_get',
    responseSchema: audioBusesSchema,
    params: () => ({}),
    present: (layout) => textResult(describeAudioBuses(layout)),
  });
  const listener = new BridgeTool(game, {
    name: 'audio_buses_get',
    definition,
    method: 'game.audio_levels',
    responseSchema: audioLevelsSchema,
    params: (input) => ({ window_physics_frames: input.window_physics_frames }),
    timeoutMs: (input) => listeningTimeoutMs(input.window_physics_frames),
    present: (levels) => textResult(describeAudioLevels(levels)),
  });
  return {
    name: 'audio_buses_get',
    definition,
    execute: (input) => (input.in_game === true ? listener.execute(input) : layoutReader.execute(input)),
  };
}

const physicsFramesPerSecond = 60;
const listeningAllowanceMs = 20_000;

function listeningTimeoutMs(frames: number): number {
  return (frames / physicsFramesPerSecond) * 1000 + listeningAllowanceMs;
}

function describeAudioLevels(levels: AudioLevels): string {
  const place = levels.scene === '' ? 'the running game' : `the running game (${levels.scene})`;
  const lines = [
    `Sound of ${place} over ${String(levels.window_physics_frames)} physics frames; a bus below ${String(levels.silence_below_db)} dB is silent:`,
    ...levels.buses.map((bus) => `- ${describeBusLevel(bus)}`),
  ];
  if (levels.players.length === 0) {
    lines.push('No player is playing; a player starts with play(), or with autoplay when the scene starts.');
  } else {
    lines.push(`Playing: ${levels.players.map(describePlayingPlayer).join('; ')}`);
  }
  if (levels.idle_players.length > 0) {
    lines.push(`Not playing: ${levels.idle_players.map(describeIdlePlayer).join('; ')}`);
  }
  return lines.join('\n');
}

function describeBusLevel(bus: AudioBusLevel): string {
  const parts = [bus.silent ? 'silent' : `peak ${String(Number(bus.highest_peak_db.toFixed(1)))} dB`];
  if (bus.volume_db !== 0) {
    parts.push(`at ${String(Number(bus.volume_db.toFixed(2)))} dB`);
  }
  if (bus.mute) {
    parts.push('muted');
  }
  if (bus.solo) {
    parts.push('solo');
  }
  return `${bus.name}: ${parts.join(', ')}`;
}

function describePlayingPlayer(player: PlayingPlayer): string {
  return `${player.path} (${player.type}) on ${player.bus}, ${player.stream} at ${String(Number(player.volume_db.toFixed(2)))} dB`;
}

function describeIdlePlayer(player: IdlePlayer): string {
  return `${player.path} (${player.type}) on ${player.bus}${player.autoplay ? ', autoplay' : ''}`;
}

function describeAudioBuses(layout: AudioBuses): string {
  const heading = layout.saved
    ? `The audio buses of the project, saved in ${layout.layout}:`
    : `The project has no bus layout file yet, only ${layout.buses.map((bus) => bus.name).join(', ')}; audio_buses_set saves the buses to ${layout.layout}.`;
  return [heading, ...describeBusLines(layout.buses)].join('\n');
}

const audioBusSettingInput = z.object({
  name: z.string().min(1).describe('The bus to add or change, such as "Music". A new bus is added after the others.'),
  volume_db: z.number().optional().describe('The volume in decibels: 0 leaves the sound as it is, -6 is about half as loud, -80 silent.'),
  send: z.string().optional().describe('The bus that this one sends its sound to, which must come before it in the layout. Default for a new bus: "Master".'),
  mute: z.boolean().optional().describe('Silence the bus.'),
  solo: z.boolean().optional().describe('Silence every bus that is not solo.'),
  bypass_effects: z.boolean().optional().describe('Let the sound through without the effects of the bus.'),
});

const audioBusesSetInput = z.object({
  buses: z
    .array(audioBusSettingInput)
    .optional()
    .describe('Buses to add or change, in order; settings that are left out keep their value. Example: [{"name": "Music", "volume_db": -6}, {"name": "Effects"}].'),
  remove: z.array(z.string().min(1)).optional().describe('Buses to remove by name. Master stays.'),
});

const changedAudioBusesSchema = z.object({
  layout: z.string(),
  added: z.array(z.string()),
  changed: z.array(z.string()),
  removed: z.array(z.string()),
  buses: z.array(audioBusSchema),
});

type ChangedAudioBuses = z.infer<typeof changedAudioBusesSchema>;

export function createAudioBusesSetTool(editor: EditorGateway): BridgeTool<typeof audioBusesSetInput, ChangedAudioBuses> {
  return new BridgeTool(editor, {
    name: 'audio_buses_set',
    definition: {
      title: 'Change audio buses',
      description:
        'Add, change and remove buses of the audio bus layout of the project, as the Audio panel of the editor does, and save the layout file at once, so that the game starts with them: such as a Music and an Effects bus, each with its own volume, both sending to Master. Then pick the bus of each player with node_set_properties, such as {"bus": "Music"}; a player whose bus does not exist plays on Master.',
      inputSchema: audioBusesSetInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'audio.buses_set',
    responseSchema: changedAudioBusesSchema,
    present: (result) => textResult(describeChangedAudioBuses(result)),
  });
}

function describeChangedAudioBuses(result: ChangedAudioBuses): string {
  const changes = [
    result.added.length > 0 ? `added ${listNames(result.added)}` : '',
    result.changed.length > 0 ? `changed ${listNames(result.changed)}` : '',
    result.removed.length > 0 ? `removed ${listNames(result.removed)}` : '',
  ].filter((change) => change !== '');
  const heading =
    changes.length === 0
      ? `The buses already were so; the bus layout is saved in ${result.layout}:`
      : `${capitalize(listNames(changes))}, and saved the bus layout to ${result.layout}:`;
  const firstAdded = result.added[0];
  const hint = firstAdded === undefined ? [] : [`A player plays on a bus through its "bus" property, such as node_set_properties with {"bus": "${firstAdded}"}.`];
  return [heading, ...describeBusLines(result.buses), ...hint].join('\n');
}

function describeBusLines(buses: readonly AudioBus[]): string[] {
  return buses.map((bus) => `- ${describeBus(bus)}`);
}

function describeBus(bus: AudioBus): string {
  const parts = [`${String(Number(bus.volume_db.toFixed(2)))} dB`, bus.send === '' ? 'plays to the speakers' : `sends to ${bus.send}`];
  if (bus.mute) {
    parts.push('muted');
  }
  if (bus.solo) {
    parts.push('solo');
  }
  if (bus.bypass_effects) {
    parts.push('effects bypassed');
  }
  if (bus.effects.length > 0) {
    parts.push(`effects ${bus.effects.map((effect) => (effect.enabled ? effect.type : `${effect.type} (off)`)).join(', ')}`);
  }
  return `${bus.name}: ${parts.join(', ')}`;
}

function listNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
