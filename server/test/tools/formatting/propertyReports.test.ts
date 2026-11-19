import { describe, expect, it } from 'vitest';
import { formatApplyReport, formatPropertyList, formatValue } from '../../../src/tools/formatting/propertyReports.js';

describe('formatApplyReport', () => {
  it('lists applied, rejected and not applied properties', () => {
    const text = formatApplyReport({
      applied: ['position', 'mesh'],
      rejected: [{ name: 'positon', reason: 'CharacterBody3D has no property "positon". Similar: position.' }],
      not_applied: [{ name: 'value', expected: 500, actual: 100 }],
    });

    expect(text).toBe(
      [
        'Applied: position, mesh',
        'Rejected:',
        '- positon: CharacterBody3D has no property "positon". Similar: position.',
        'Not applied, the engine kept another value:',
        '- value: wanted 500, got 100',
      ].join('\n'),
    );
  });

  it('says when nothing was requested', () => {
    expect(formatApplyReport({ applied: [], rejected: [], not_applied: [] })).toBe('No properties were set.');
  });
});

describe('formatValue', () => {
  it('writes Godot syntax and numbers as they are and quotes text', () => {
    expect(formatValue('Vector3(1, 2, 3)', 'Vector3')).toBe('Vector3(1, 2, 3)');
    expect(formatValue(5, 'int')).toBe('5');
    expect(formatValue('Hello', 'String')).toBe('"Hello"');
    expect(formatValue(['a', 1], 'Array')).toBe('["a",1]');
    expect(formatValue(null, 'Mesh')).toBe('null');
  });

  it('quotes text when the type is unknown', () => {
    expect(formatValue('res://main.tscn')).toBe('"res://main.tscn"');
    expect(formatValue('Vector3(1, 2, 3)', 'Variant')).toBe('"Vector3(1, 2, 3)"');
    expect(formatValue(undefined)).toBe('null');
  });
});

describe('formatPropertyList', () => {
  it('lists the properties with their types and enum options', () => {
    const text = formatPropertyList({
      scene: 'res://levels/arena.tscn',
      path: 'Player/Mesh',
      type: 'MeshInstance3D',
      properties: [
        { name: 'mesh', type: 'Mesh', value: '<BoxMesh>' },
        {
          name: 'cast_shadow',
          type: 'enum',
          value: 2,
          options: [
            { name: 'Off', value: 0 },
            { name: 'On', value: 1 },
            { name: 'Double-Sided', value: 2 },
            { name: 'Shadows Only', value: 3 },
          ],
        },
        { name: 'speed', error: 'MeshInstance3D has no property "speed".' },
      ],
    });

    expect(text).toBe(
      [
        'Player/Mesh (MeshInstance3D) in res://levels/arena.tscn',
        'mesh = <BoxMesh>  [Mesh]',
        'cast_shadow = 2 (Double-Sided)  [enum: Off, On, Double-Sided, Shadows Only]',
        'speed: MeshInstance3D has no property "speed".',
      ].join('\n'),
    );
  });

  it('lists the layers of a mask with the names that the project gives them', () => {
    const text = formatPropertyList({
      scene: 'res://levels/arena.tscn',
      path: 'Door/Area',
      type: 'Area3D',
      properties: [
        {
          name: 'collision_mask',
          type: 'int',
          value: 5,
          layer_kind: '3d_physics',
          layers: [
            { number: 1, name: 'world' },
            { number: 3, name: '' },
          ],
        },
        { name: 'collision_layer', type: 'int', value: 0, layer_kind: '3d_physics', layers: [] },
        { name: 'layers', type: 'int', value: 2, layer_kind: '3d_render', layers: [{ number: 2, name: 'minimap' }] },
      ],
    });

    expect(text).toBe(
      [
        'Door/Area (Area3D) in res://levels/arena.tscn',
        'collision_mask = 5 (layers 1 "world", 3)  [3d_physics layers]',
        'collision_layer = 0 (no layers)  [3d_physics layers]',
        'layers = 2 (layer 2 "minimap")  [3d_render layers]',
      ].join('\n'),
    );
  });

  it('names enum values by their explicit numbers', () => {
    const text = formatPropertyList({
      scene: 'res://a.tscn',
      path: 'Guard',
      type: 'CharacterBody3D',
      properties: [{ name: 'gait', type: 'enum', value: 1, options: [{ name: 'Walk', value: 1 }, { name: 'Run', value: 4 }] }],
    });

    expect(text).toContain('gait = 1 (Walk)  [enum: Walk, Run]');
  });

  it('calls the scene root by its role', () => {
    const text = formatPropertyList({ scene: 'res://a.tscn', path: '.', type: 'Node3D', properties: [{ name: 'visible', type: 'bool', value: false }] });

    expect(text.split('\n')[0]).toBe('The scene root (Node3D) in res://a.tscn');
  });

  it('explains an empty list', () => {
    const text = formatPropertyList({ scene: 'res://a.tscn', path: '.', type: 'Node3D', properties: [] });

    expect(text).toContain('All properties have their default values');
  });
});
