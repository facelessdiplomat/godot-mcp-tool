import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createAudioBusesGetTool, createAudioBusesSetTool } from '../../src/tools/audioTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const master = { name: 'Master', volume_db: 0, send: '', mute: false, solo: false, bypass_effects: false, effects: [] };
const music = { name: 'Music', volume_db: -6, send: 'Master', mute: false, solo: false, bypass_effects: false, effects: [] };
const effects = {
  name: 'Effects',
  volume_db: 0,
  send: 'Master',
  mute: true,
  solo: false,
  bypass_effects: false,
  effects: [
    { type: 'AudioEffectReverb', enabled: true },
    { type: 'AudioEffectCompressor', enabled: false },
  ],
};

describe('audio bus tools', () => {
  it('audio_buses_get lists the buses with their volume, send, switches and effects', async () => {
    const editor = new FakeEditorGateway().respondTo('audio.buses_get', { layout: 'res://default_bus_layout.tres', saved: true, buses: [master, music, effects] });

    const text = textOf(await createAudioBusesGetTool(editor, new FakeEditorGateway()).execute({}));

    expect(editor.requests[0]?.params).toEqual({});
    expect(text).toBe(
      [
        'The audio buses of the project, saved in res://default_bus_layout.tres:',
        '- Master: 0 dB, plays to the speakers',
        '- Music: -6 dB, sends to Master',
        '- Effects: 0 dB, sends to Master, muted, effects AudioEffectReverb, AudioEffectCompressor (off)',
      ].join('\n'),
    );
  });

  it('audio_buses_get says when the project has no bus layout file yet', async () => {
    const editor = new FakeEditorGateway().respondTo('audio.buses_get', { layout: 'res://default_bus_layout.tres', saved: false, buses: [master] });

    const text = textOf(await createAudioBusesGetTool(editor, new FakeEditorGateway()).execute({}));

    expect(text).toBe(
      ['The project has no bus layout file yet, only Master; audio_buses_set saves the buses to res://default_bus_layout.tres.', '- Master: 0 dB, plays to the speakers'].join('\n'),
    );
  });

  it('audio_buses_get with in_game listens to the buses of the running game and lists the players', async () => {
    const projectReader = new FakeEditorGateway();
    const game = new FakeEditorGateway().respondTo('game.audio_levels', {
      scene: 'res://arena.tscn',
      window_physics_frames: 30,
      silence_below_db: -60,
      buses: [
        { name: 'Master', volume_db: 0, send: '', mute: false, solo: false, highest_peak_db: -12.34, silent: false },
        { name: 'Music', volume_db: -80, send: 'Master', mute: false, solo: false, highest_peak_db: -200, silent: true },
        { name: 'Effects', volume_db: 0, send: 'Master', mute: true, solo: false, highest_peak_db: -200, silent: true },
      ],
      players: [{ path: 'Music', type: 'AudioStreamPlayer', bus: 'Music', stream: 'res://music/theme.ogg', volume_db: 0 }],
      idle_players: [{ path: 'Player/Jump', type: 'AudioStreamPlayer3D', bus: 'Effects', autoplay: false }],
    });

    const text = textOf(await createAudioBusesGetTool(projectReader, game).execute({ in_game: true }));

    expect(projectReader.requests).toEqual([]);
    expect(game.requests[0]?.params).toEqual({ window_physics_frames: 30 });
    expect(text).toBe(
      [
        'Sound of the running game (res://arena.tscn) over 30 physics frames; a bus below -60 dB is silent:',
        '- Master: peak -12.3 dB',
        '- Music: silent, at -80 dB',
        '- Effects: silent, muted',
        'Playing: Music (AudioStreamPlayer) on Music, res://music/theme.ogg at 0 dB',
        'Not playing: Player/Jump (AudioStreamPlayer3D) on Effects',
      ].join('\n'),
    );
  });

  it('audio_buses_get with in_game says when no player plays', async () => {
    const game = new FakeEditorGateway().respondTo('game.audio_levels', {
      scene: 'res://arena.tscn',
      window_physics_frames: 60,
      silence_below_db: -60,
      buses: [{ name: 'Master', volume_db: 0, send: '', mute: false, solo: false, highest_peak_db: -200, silent: true }],
      players: [],
      idle_players: [{ path: 'Music', type: 'AudioStreamPlayer', bus: 'Master', autoplay: false }],
    });

    const text = textOf(await createAudioBusesGetTool(new FakeEditorGateway(), game).execute({ in_game: true, window_physics_frames: 60 }));

    expect(text).toContain('No player is playing; a player starts with play(), or with autoplay when the scene starts.');
    expect(text).toContain('Not playing: Music (AudioStreamPlayer) on Master');
  });

  it('audio_buses_set sends the buses and says what changed', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('audio.buses_set', { layout: 'res://default_bus_layout.tres', added: ['Music', 'Effects'], changed: ['Master'], removed: ['Old'], buses: [master, music, effects] })
      .respondTo('audio.buses_set', { layout: 'res://default_bus_layout.tres', added: [], changed: [], removed: [], buses: [master, music] });
    const buses = [{ name: 'Music', volume_db: -6 }, { name: 'Effects' }];

    const changed = textOf(await createAudioBusesSetTool(editor).execute({ buses, remove: ['Old'] }));
    const same = textOf(await createAudioBusesSetTool(editor).execute({ buses: [{ name: 'Music', volume_db: -6 }] }));

    expect(editor.requests[0]?.params).toEqual({ buses, remove: ['Old'] });
    expect(changed).toBe(
      [
        'Added Music and Effects, changed Master and removed Old, and saved the bus layout to res://default_bus_layout.tres:',
        '- Master: 0 dB, plays to the speakers',
        '- Music: -6 dB, sends to Master',
        '- Effects: 0 dB, sends to Master, muted, effects AudioEffectReverb, AudioEffectCompressor (off)',
        'A player plays on a bus through its "bus" property, such as node_set_properties with {"bus": "Music"}.',
      ].join('\n'),
    );
    expect(same.split('\n')[0]).toBe('The buses already were so; the bus layout is saved in res://default_bus_layout.tres:');
  });
});
