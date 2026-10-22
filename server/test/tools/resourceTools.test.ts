import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createResourceCreateTool, createResourceGetTool, createResourceSetPropertiesTool } from '../../src/tools/resourceTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

describe('resource tools', () => {
  it('resource_create forwards the resource and reports what applied', async () => {
    const editor = new FakeEditorGateway().respondTo('resource.create', {
      path: 'res://materials/ice.tres',
      type: 'PhysicsMaterial',
      applied: ['friction'],
      rejected: [{ name: 'bounciness', reason: 'PhysicsMaterial has no property "bounciness". Similar: bounce.' }],
      not_applied: [],
    });

    const result = await createResourceCreateTool(editor).execute({ path: 'res://materials/ice.tres', type: 'PhysicsMaterial', properties: { friction: 0.05, bounciness: 0.2 } });

    expect(editor.requests[0]?.params).toEqual({ path: 'res://materials/ice.tres', type: 'PhysicsMaterial', properties: { friction: 0.05, bounciness: 0.2 } });
    expect(textOf(result)).toBe(
      [
        'Created res://materials/ice.tres (PhysicsMaterial).',
        'Applied: friction',
        'Rejected:',
        '- bounciness: PhysicsMaterial has no property "bounciness". Similar: bounce.',
      ].join('\n'),
    );
  });

  it('resource_create says only that it created the file when no properties were given', async () => {
    const editor = new FakeEditorGateway().respondTo('resource.create', { path: 'res://stats/goblin.tres', type: 'EnemyStats', applied: [], rejected: [], not_applied: [] });

    const result = await createResourceCreateTool(editor).execute({ path: 'res://stats/goblin.tres', type: 'EnemyStats' });

    expect(textOf(result)).toBe('Created res://stats/goblin.tres (EnemyStats).');
  });

  it('resource_get lists the properties and the files the resource depends on', async () => {
    const editor = new FakeEditorGateway().respondTo('resource.get', {
      path: 'res://materials/ice.tres',
      type: 'StandardMaterial3D',
      properties: [
        { name: 'albedo_color', type: 'Color', value: 'Color(0.8, 0.9, 1, 1)' },
        { name: 'albedo_texture', type: 'Texture2D', value: 'res://textures/ice.png' },
        { name: 'metalic', error: 'StandardMaterial3D has no property "metalic". Similar: metallic.' },
      ],
      dependencies: ['res://textures/ice.png'],
    });

    const result = await createResourceGetTool(editor).execute({ path: 'res://materials/ice.tres' });

    expect(editor.requests[0]?.params).toEqual({ path: 'res://materials/ice.tres', include_defaults: false });
    expect(textOf(result)).toBe(
      [
        'res://materials/ice.tres (StandardMaterial3D)',
        'albedo_color = Color(0.8, 0.9, 1, 1)  [Color]',
        'albedo_texture = res://textures/ice.png  [Texture2D]',
        'metalic: StandardMaterial3D has no property "metalic". Similar: metallic.',
        'Depends on: res://textures/ice.png',
      ].join('\n'),
    );
  });

  it('resource_get says when every property has its default value', async () => {
    const editor = new FakeEditorGateway().respondTo('resource.get', { path: 'res://materials/ice.tres', type: 'PhysicsMaterial', properties: [], dependencies: [] });

    const result = await createResourceGetTool(editor).execute({ path: 'res://materials/ice.tres' });

    expect(textOf(result)).toBe(
      'res://materials/ice.tres (PhysicsMaterial)\nAll properties have their default values. Pass include_defaults: true, or names, to list them anyway.',
    );
  });

  it('resource_set_properties reports that it saved the file', async () => {
    const editor = new FakeEditorGateway().respondTo('resource.set_properties', {
      path: 'res://materials/ice.tres',
      type: 'PhysicsMaterial',
      applied: ['friction'],
      rejected: [],
      not_applied: [{ name: 'bounce', expected: 5, actual: 1 }],
    });

    const result = await createResourceSetPropertiesTool(editor).execute({ path: 'res://materials/ice.tres', properties: { friction: 0.1, bounce: 5 } });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      [
        'Updated res://materials/ice.tres (PhysicsMaterial) and saved it.',
        'Applied: friction',
        'Not applied, the engine kept another value:',
        '- bounce: wanted 5, got 1',
      ].join('\n'),
    );
  });

  it('resource_set_properties is an error when no value applied', async () => {
    const editor = new FakeEditorGateway().respondTo('resource.set_properties', {
      path: 'res://materials/ice.tres',
      type: 'PhysicsMaterial',
      applied: [],
      rejected: [{ name: 'frictoin', reason: 'PhysicsMaterial has no property "frictoin". Similar: friction.' }],
      not_applied: [],
    });

    const result = await createResourceSetPropertiesTool(editor).execute({ path: 'res://materials/ice.tres', properties: { frictoin: 0.1 } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      [
        'No property of res://materials/ice.tres took the requested value.',
        'Rejected:',
        '- frictoin: PhysicsMaterial has no property "frictoin". Similar: friction.',
      ].join('\n'),
    );
  });

  it('marks which resource tools only read', () => {
    const editor = new FakeEditorGateway();

    expect(createResourceGetTool(editor).definition.annotations.readOnlyHint).toBe(true);
    expect(createResourceCreateTool(editor).definition.annotations.readOnlyHint).toBe(false);
    expect(createResourceSetPropertiesTool(editor).definition.annotations.destructiveHint).toBe(true);
  });
});
