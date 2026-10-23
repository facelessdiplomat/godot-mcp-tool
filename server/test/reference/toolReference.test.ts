import { describe, expect, it } from 'vitest';
import { type ListedTool, renderToolReference, type ServerListing } from './toolReference.js';

function listingOf(tools: readonly ListedTool[], extra: Partial<ServerListing> = {}): ServerListing {
  return { tools, prompts: [], resources: [], resourceTemplates: [], ...extra };
}

function toolNamed(name: string, inputSchema: ListedTool['inputSchema'] = { type: 'object' }): ListedTool {
  return { name, title: `Title of ${name}`, description: `What ${name} does.`, inputSchema, annotations: { readOnlyHint: true } };
}

describe('renderToolReference', () => {
  it('says what the page lists and how it is kept up to date', () => {
    const reference = renderToolReference(listingOf([]));

    expect(reference.startsWith('# Tool reference\n')).toBe(true);
    expect(reference).toContain('run `npm run docs:tools` in `server/`');
  });

  it('groups the tools by area in the order the server lists them, after a table of contents', () => {
    const reference = renderToolReference(listingOf([toolNamed('godot_status'), toolNamed('scene_get_tree'), toolNamed('game_run'), toolNamed('editor_launch'), toolNamed('mystery_tool')]));

    expect(reference).toContain(
      [
        '- [Connection and editor](#connection-and-editor): `godot_status`, `editor_launch`',
        '- [Scenes and nodes](#scenes-and-nodes): `scene_get_tree`',
        '- [The running game](#the-running-game): `game_run`',
        '- [Other tools](#other-tools): `mystery_tool`',
      ].join('\n'),
    );
    const sections = ['## Connection and editor', '### `godot_status`', '### `editor_launch`', '## Scenes and nodes', '## The running game', '## Other tools'].map((heading) =>
      reference.indexOf(`\n${heading}\n`),
    );
    expect(sections.every((position) => position > 0)).toBe(true);
    expect([...sections].sort((left, right) => left - right)).toEqual(sections);
  });

  it('describes a tool with its title, its marks and its parameters', () => {
    const reference = renderToolReference(
      listingOf([
        {
          name: 'game_run',
          title: 'Run game',
          description: 'Run the game and return its first output.',
          inputSchema: {
            type: 'object',
            properties: {
              scene: { type: 'string', default: 'main', description: 'What to run.' },
              duration_ms: { type: 'integer', minimum: 0, maximum: 600000, description: 'Keep the game running this long.' },
            },
          },
          annotations: { readOnlyHint: false },
          _meta: { 'anthropic/alwaysLoad': true },
        },
      ]),
    );

    expect(reference).toContain(
      [
        '### `game_run`',
        '',
        '**Run game.** Run the game and return its first output.',
        '',
        '*Makes changes · loaded at the start*',
        '',
        '- `scene`: string, default `"main"`. What to run.',
        '- `duration_ms`: integer from 0 to 600000. Keep the game running this long.',
        '',
      ].join('\n'),
    );
  });

  it('marks read-only tools and the unsafe tools that are off by default', () => {
    const unsafeTool: ListedTool = { ...toolNamed('game_eval'), annotations: { readOnlyHint: false }, _meta: { 'anthropic/requiresUserInteraction': true } };

    const reference = renderToolReference(listingOf([toolNamed('game_get_tree'), unsafeTool]));

    expect(reference).toContain('### `game_get_tree`\n\n**Title of game_get_tree.** What game_get_tree does.\n\n*Read-only*\n\nNo parameters.\n');
    expect(reference).toContain('*Makes changes · off by default; Claude Code asks before every call*');
  });

  it('marks required parameters and lists the choices of an enumeration', () => {
    const reference = renderToolReference(
      listingOf([
        toolNamed('game_pause', {
          type: 'object',
          properties: { state: { type: 'string', enum: ['tap', 'down', 'up'], description: 'How to press.' }, count: { type: 'integer', minimum: 1, description: 'How often.' } },
          required: ['state'],
        }),
      ]),
    );

    expect(reference).toContain('- `state` (required): "tap", "down" or "up". How to press.\n- `count`: integer, at least 1. How often.\n');
  });

  it('unfolds lists of objects and the variants of their items', () => {
    const reference = renderToolReference(
      listingOf([
        toolNamed('game_input', {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              minItems: 1,
              maxItems: 200,
              description: 'Steps to play in order.',
              items: {
                anyOf: [
                  {
                    type: 'object',
                    properties: { action: { type: 'string', description: 'An input action.' }, strength: { type: 'number', minimum: 0, maximum: 1, description: 'How strongly.' } },
                    required: ['action'],
                  },
                  { type: 'object', properties: { key: { type: 'string', description: 'A key name.' } }, required: ['key'] },
                ],
              },
            },
            names: { type: 'array', items: { type: 'string' }, description: 'Names to read.' },
            position: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' }, description: 'Camera position.' },
          },
          required: ['steps'],
        }),
      ]),
    );

    expect(reference).toContain(
      [
        '- `steps` (required): list of 1 to 200 items. Steps to play in order. Each item is one of:',
        '  - an object with:',
        '    - `action` (required): string. An input action.',
        '    - `strength`: number from 0 to 1. How strongly.',
        '  - an object with:',
        '    - `key` (required): string. A key name.',
        '- `names`: list of strings. Names to read.',
        '- `position`: list of 3 numbers. Camera position.',
        '',
      ].join('\n'),
    );
  });

  it('names maps of values, simple alternatives and nested objects', () => {
    const reference = renderToolReference(
      listingOf([
        toolNamed('node_set_properties', {
          type: 'object',
          properties: {
            properties: { type: 'object', propertyNames: { type: 'string' }, additionalProperties: {}, description: 'Property names mapped to values.' },
            value: { anyOf: [{ type: 'string' }, { type: 'number' }], description: 'A value.' },
            camera: { type: 'object', properties: { fov: { type: 'number', description: 'Field of view.' } }, description: 'Where to look from.' },
          },
        }),
      ]),
    );

    expect(reference).toContain(
      [
        '- `properties`: object that maps names to values. Property names mapped to values.',
        '- `value`: string or number. A value.',
        '- `camera`: object. Where to look from. It has:',
        '  - `fov`: number. Field of view.',
        '',
      ].join('\n'),
    );
  });

  it('lists the prompts with their arguments and the resources', () => {
    const reference = renderToolReference(
      listingOf([], {
        prompts: [
          { name: 'fix_last_run', title: 'Fix the last run', description: 'Fix the errors of the last game run.', arguments: [] },
          { name: 'playtest', title: 'Playtest', description: 'Playtest the game.', arguments: [{ name: 'scene', description: 'The scene to playtest.', required: false }] },
        ],
        resources: [{ name: 'project', title: 'Project overview', uri: 'godot://project', description: 'The Godot project.' }],
        resourceTemplates: [{ name: 'scene', title: 'Scene tree', uriTemplate: 'godot://scene/{+path}', description: 'The node tree of a scene.' }],
      }),
    );

    expect(reference).toContain(
      [
        '## Prompts',
        '',
        'In Claude Code the prompts are slash commands; the [usage guide](usage.md#slash-commands) shows how to run them.',
        '',
        '### `fix_last_run`',
        '',
        '**Fix the last run.** Fix the errors of the last game run.',
        '',
        'No arguments.',
        '',
        '### `playtest`',
        '',
        '**Playtest.** Playtest the game.',
        '',
        '- `scene`: The scene to playtest.',
        '',
        '## Resources',
        '',
        '- `godot://project`: **Project overview.** The Godot project.',
        '- `godot://scene/{+path}`: **Scene tree.** The node tree of a scene.',
        '',
      ].join('\n'),
    );
  });
});
