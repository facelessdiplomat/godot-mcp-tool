import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import type { ClassDoc } from '../../src/docs/ClassDoc.js';
import { DocsLibrary } from '../../src/docs/DocsLibrary.js';
import { DocsUnavailableError } from '../../src/docs/DocsSource.js';
import { DocsClassTool, DocsSearchTool } from '../../src/tools/docsTools.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

function classDoc(fields: Partial<ClassDoc> & { readonly name: string }): ClassDoc {
  return { origin: 'engine', brief: '', description: '', constructors: [], properties: [], methods: [], signals: [], constants: [], enums: [], ...fields };
}

const node = classDoc({
  name: 'Node',
  brief: 'Base class for all scene objects.',
  methods: [
    {
      name: 'add_child',
      returnType: 'void',
      parameters: [
        { name: 'node', type: 'Node' },
        { name: 'force_readable_name', type: 'bool', defaultValue: 'false' },
      ],
      qualifiers: [],
      description: 'Adds a child [param node]. Nodes can have any number of children.',
    },
  ],
  constants: [{ name: 'NOTIFICATION_READY', value: '13', description: 'Notification received when the node is ready.' }],
});
const node3d = classDoc({ name: 'Node3D', inherits: 'Node', brief: 'Most basic 3D game object.' });
const characterBody = classDoc({
  name: 'CharacterBody3D',
  inherits: 'Node3D',
  brief: 'A 3D physics body specialized for characters moved by script.',
  description: '[CharacterBody3D] is meant to be user-controlled.\nUse [method move_and_slide] to move it.',
  properties: [{ name: 'velocity', type: 'Vector3', setter: 'set_velocity', getter: 'get_velocity', description: 'Current velocity vector (typically meters per second).' }],
  methods: [
    { name: 'move_and_slide', returnType: 'bool', parameters: [], qualifiers: [], description: 'Moves the body based on [member velocity]. It slides along walls.' },
    { name: 'is_on_floor', returnType: 'bool', parameters: [], qualifiers: ['const'], description: '' },
    { name: 'set_velocity', returnType: 'void', parameters: [{ name: 'velocity', type: 'Vector3' }], qualifiers: [], description: '' },
    { name: 'get_velocity', returnType: 'Vector3', parameters: [], qualifiers: ['const'], description: '' },
  ],
  signals: [],
  enums: [
    {
      name: 'MotionMode',
      isBitfield: false,
      values: [
        { name: 'MOTION_MODE_GROUNDED', value: '0', description: 'Apply when walls, ceiling and floor matter.' },
        { name: 'MOTION_MODE_FLOATING', value: '1', description: 'Apply when there is no floor.' },
      ],
    },
  ],
});
const vector3 = classDoc({
  name: 'Vector3',
  origin: 'builtin',
  brief: 'A 3D vector using floating-point coordinates.',
  constructors: [
    {
      name: 'Vector3',
      returnType: 'Vector3',
      parameters: [
        { name: 'x', type: 'float' },
        { name: 'y', type: 'float' },
        { name: 'z', type: 'float' },
      ],
      qualifiers: [],
      description: 'Returns a [Vector3] with the given components.',
    },
  ],
  properties: [{ name: 'x', type: 'float', description: "The vector's X component." }],
});
const globalScope = classDoc({
  name: '@GlobalScope',
  brief: 'Global functions, enums and constants that are available everywhere.',
  methods: [{ name: 'lerp', returnType: 'Variant', parameters: [{ name: 'from', type: 'Variant' }], qualifiers: [], description: 'Linearly interpolates.' }],
});
const goblin = classDoc({
  name: 'Goblin',
  inherits: 'CharacterBody3D',
  origin: 'project',
  scriptPath: 'res://enemies/goblin.gd',
  brief: 'A small enemy.',
  properties: [{ name: 'speed', type: 'float', defaultValue: '3.5', description: 'How fast it walks.' }],
});

const library = new DocsLibrary([node, node3d, characterBody, vector3, globalScope, goblin]);
const provider = { load: () => Promise.resolve(library) };

describe('docs_class', () => {
  const tool = new DocsClassTool(provider);

  it('loads on demand, like docs_search', () => {
    expect([tool.definition.alwaysLoad, new DocsSearchTool(provider).definition.alwaysLoad]).toEqual([false, false]);
  });

  it('shows a class with its ancestry and its members in short', async () => {
    const text = textOf(await tool.execute({ name: 'CharacterBody3D' }));

    expect(text).toBe(
      [
        'CharacterBody3D — engine class',
        'Inherits: Node3D < Node',
        'A 3D physics body specialized for characters moved by script.',
        '',
        '`CharacterBody3D` is meant to be user-controlled.',
        'Use `move_and_slide()` to move it.',
        '',
        'Properties:',
        '- velocity: Vector3 — Current velocity vector (typically meters per second).',
        'Methods:',
        '- move_and_slide() -> bool — Moves the body based on `velocity`.',
        '- is_on_floor() const -> bool',
        'Enums:',
        '- MotionMode: MOTION_MODE_GROUNDED = 0, MOTION_MODE_FLOATING = 1',
        '',
        'Setters and getters of properties and inherited members of Node3D and Node are not listed; docs_class with member shows any member in full.',
      ].join('\n'),
    );
  });

  it('shows the class of the project with its script and defaults', async () => {
    const text = textOf(await tool.execute({ name: 'Goblin' }));

    expect(text).toContain('Goblin — class of this project, res://enemies/goblin.gd');
    expect(text).toContain('Inherits: CharacterBody3D < Node3D < Node');
    expect(text).toContain('- speed: float = 3.5 — How fast it walks.');
  });

  it('shows the constructors of a built-in type', async () => {
    const text = textOf(await tool.execute({ name: 'Vector3' }));

    expect(text).toContain('Vector3 — built-in type');
    expect(text).toContain('Constructors:\n- Vector3(x: float, y: float, z: float) — Returns a `Vector3` with the given components.');
  });

  it('shows one member in full, inherited ones included', async () => {
    const own = textOf(await tool.execute({ name: 'CharacterBody3D', member: 'move_and_slide' }));
    const inherited = textOf(await tool.execute({ name: 'Goblin', member: 'add_child' }));

    expect(own).toBe('CharacterBody3D.move_and_slide() -> bool\nMethod of CharacterBody3D.\n\nMoves the body based on `velocity`. It slides along walls.');
    expect(inherited).toBe(
      'Node.add_child(node: Node, force_readable_name: bool = false) -> void\nMethod of Node, inherited by Goblin.\n\nAdds a child `node`. Nodes can have any number of children.',
    );
  });

  it('accepts Class.member as the name', async () => {
    const text = textOf(await tool.execute({ name: 'CharacterBody3D.velocity' }));

    expect(text).toBe('CharacterBody3D.velocity: Vector3\nProperty of CharacterBody3D.\n\nCurrent velocity vector (typically meters per second).');
  });

  it('shows enums with every value', async () => {
    const text = textOf(await tool.execute({ name: 'CharacterBody3D', member: 'MotionMode' }));

    expect(text).toBe(
      [
        'CharacterBody3D.MotionMode',
        'Enum of CharacterBody3D.',
        '',
        '- MOTION_MODE_GROUNDED = 0 — Apply when walls, ceiling and floor matter.',
        '- MOTION_MODE_FLOATING = 1 — Apply when there is no floor.',
      ].join('\n'),
    );
  });

  it('finds global functions by their name alone', async () => {
    const text = textOf(await tool.execute({ name: 'lerp' }));

    expect(text).toBe('@GlobalScope.lerp(from: Variant) -> Variant\nFunction of @GlobalScope.\n\nLinearly interpolates.');
  });

  it('keeps the reference of a large class within the size of one answer', async () => {
    const methods = Array.from({ length: 800 }, (_, index) => ({
      name: `method_number_${String(index)}`,
      returnType: 'void',
      parameters: [{ name: 'value', type: 'int' }],
      qualifiers: [],
      description: `Does thing number ${String(index)} with a long explanation that goes on and on to fill the summary of this method.`,
    }));
    const server = classDoc({ name: 'RenderingServer', brief: 'Server for anything visible.', methods });
    const largeTool = new DocsClassTool({ load: () => Promise.resolve(new DocsLibrary([server])) });

    const text = textOf(await largeTool.execute({ name: 'RenderingServer' }));

    expect(text.length).toBeLessThanOrEqual(24_000);
    expect(text).toContain('- method_number_0(value: int) -> void\n');
    expect(text).toMatch(/- … \d+ more methods/);
    expect(text).toContain('Members are listed without summaries because the class is large.');
    expect(text).toContain('Some members are not listed; find them with docs_search, such as "RenderingServer <word>".');
  });

  it('still shows the setters and getters of properties one by one', async () => {
    expect(textOf(await tool.execute({ name: 'CharacterBody3D', member: 'set_velocity' }))).toContain('CharacterBody3D.set_velocity(velocity: Vector3) -> void');
  });

  it('says when a member has no description', async () => {
    expect(textOf(await tool.execute({ name: 'CharacterBody3D', member: 'is_on_floor' }))).toContain('There is no description yet.');
  });

  it('suggests classes and members for misspelled names', async () => {
    const missingClass = await tool.execute({ name: 'CharacterBody' });
    const missingMember = await tool.execute({ name: 'CharacterBody3D', member: 'move_slide' });

    expect(missingClass.isError).toBe(true);
    expect(textOf(missingClass)).toContain('No class named "CharacterBody" in the reference.');
    expect(textOf(missingClass)).toContain('Similar: CharacterBody3D.');
    expect(missingMember.isError).toBe(true);
    expect(textOf(missingMember)).toContain('CharacterBody3D has no member "move_slide"');
    expect(textOf(missingMember)).toContain('move_and_slide');
  });

  it('reports why the reference is not available', async () => {
    const unavailable = new DocsClassTool({ load: () => Promise.reject(new DocsUnavailableError('No Godot executable was found.')) });

    const result = await unavailable.execute({ name: 'Node' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('No Godot executable was found.');
  });
});

describe('docs_search', () => {
  const tool = new DocsSearchTool(provider);

  it('lists classes and members with their summaries', async () => {
    const text = textOf(await tool.execute({ query: 'velocity' }));

    expect(text).toBe(
      [
        'Results for "velocity":',
        '- CharacterBody3D.velocity: Vector3 — Current velocity vector (typically meters per second).',
        '- CharacterBody3D.move_and_slide() -> bool — Moves the body based on `velocity`.',
        '',
        'docs_class shows a class; pass member to read one entry in full.',
      ].join('\n'),
    );
  });

  it('marks classes by their kind', async () => {
    const text = textOf(await tool.execute({ query: 'goblin' }));

    expect(text).toContain('- Goblin (class of this project) — A small enemy.');
  });

  it('says when nothing matches', async () => {
    expect(textOf(await tool.execute({ query: 'xyzzy' }))).toBe('Nothing in the reference matches "xyzzy". Try a shorter word, such as part of a class name.');
  });
});
