import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { textResult } from './results.js';

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

const audioBusesGetInput = z.object({});

export function createAudioBusesGetTool(projectReader: EditorGateway): BridgeTool<typeof audioBusesGetInput, AudioBuses> {
  return new BridgeTool(projectReader, {
    name: 'audio_buses_get',
    definition: {
      title: 'Read audio buses',
      description:
        'Read the audio bus layout of the project, as the Audio panel of the editor shows it: each bus in order with its volume in dB, the bus it sends to, mute, solo, bypass and its effects, and the file the layout is saved in. Players such as AudioStreamPlayer pick a bus by name with their "bus" property. Works without the editor.',
      inputSchema: audioBusesGetInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'audio.buses_get',
    responseSchema: audioBusesSchema,
    present: (layout) => textResult(describeAudioBuses(layout)),
  });
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
