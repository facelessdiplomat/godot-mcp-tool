import { describe, expect, it } from 'vitest';
import type { ClassDoc } from '../../src/docs/ClassDoc.js';
import { DocsLibrary } from '../../src/docs/DocsLibrary.js';

function classDoc(fields: Partial<ClassDoc> & { readonly name: string }): ClassDoc {
  return { origin: 'engine', brief: '', description: '', constructors: [], properties: [], methods: [], signals: [], constants: [], enums: [], ...fields };
}

const node = classDoc({
  name: 'Node',
  brief: 'Base class for all scene objects.',
  methods: [{ name: 'add_child', returnType: 'void', parameters: [{ name: 'node', type: 'Node' }], qualifiers: [], description: 'Adds a child [param node].' }],
  signals: [{ name: 'ready', parameters: [], description: 'Emitted when the node is ready.' }],
});
const node3d = classDoc({
  name: 'Node3D',
  inherits: 'Node',
  brief: 'Most basic 3D game object.',
  properties: [{ name: 'position', type: 'Vector3', description: 'Position relative to the parent.' }],
});
const characterBody = classDoc({
  name: 'CharacterBody3D',
  inherits: 'Node3D',
  brief: 'A 3D physics body specialized for characters moved by script.',
  methods: [{ name: 'move_and_slide', returnType: 'bool', parameters: [], qualifiers: [], description: 'Moves the body based on [member velocity].' }],
  properties: [{ name: 'velocity', type: 'Vector3', description: 'Current velocity vector.' }],
  enums: [{ name: 'MotionMode', isBitfield: false, values: [{ name: 'MOTION_MODE_GROUNDED', value: '0', description: 'Apply when walls matter.' }] }],
});
const tween = classDoc({
  name: 'Tween',
  brief: 'Lightweight object used for general-purpose animation via script.',
  methods: [{ name: 'tween_property', returnType: 'PropertyTweener', parameters: [], qualifiers: [], description: 'Creates a tweener that animates a property.' }],
});
const tweener = classDoc({ name: 'Tweener', brief: 'Abstract class for all tweeners.' });
const goblin = classDoc({ name: 'Goblin', inherits: 'CharacterBody3D', origin: 'project', scriptPath: 'res://enemies/goblin.gd', brief: 'A small enemy.' });

const library = new DocsLibrary([node, node3d, characterBody, tween, tweener, goblin]);

describe('DocsLibrary', () => {
  it('finds a class by its name in any case', () => {
    expect(library.find('CharacterBody3D')).toBe(characterBody);
    expect(library.find('characterbody3d')).toBe(characterBody);
    expect(library.find('Missing')).toBeUndefined();
  });

  it('suggests class names close to a misspelled one', () => {
    expect(library.similarNames('CharacterBody')).toContain('CharacterBody3D');
  });

  it('lists the ancestors of a class', () => {
    expect(library.ancestors(goblin).map((ancestor) => ancestor.name)).toEqual(['CharacterBody3D', 'Node3D', 'Node']);
  });

  it('finds members of the class and of its ancestors', () => {
    expect(library.findMember(characterBody, 'move_and_slide')).toMatchObject({ owner: characterBody, entry: { kind: 'method', doc: { name: 'move_and_slide' } } });
    expect(library.findMember(goblin, 'add_child')).toMatchObject({ owner: node, entry: { kind: 'method' } });
    expect(library.findMember(characterBody, 'POSITION')).toMatchObject({ owner: node3d, entry: { kind: 'property' } });
    expect(library.findMember(characterBody, 'MOTION_MODE_GROUNDED')).toMatchObject({ entry: { kind: 'enum value', enumName: 'MotionMode' } });
    expect(library.findMember(characterBody, 'MotionMode')).toMatchObject({ entry: { kind: 'enum' } });
    expect(library.findMember(characterBody, 'fly')).toBeUndefined();
  });

  it('suggests member names close to a misspelled one, inherited ones included', () => {
    expect(library.similarMemberNames(characterBody, 'move_slide')).toContain('move_and_slide');
    expect(library.similarMemberNames(characterBody, 'add_chld')).toContain('add_child');
  });

  it('ranks classes named after the query first', () => {
    const hits = library.search('tween', 10);

    expect(hits.slice(0, 3).map((hit) => (hit.entry === undefined ? hit.owner.name : `${hit.owner.name}.${hit.entry.doc.name}`))).toEqual([
      'Tween',
      'Tweener',
      'Tween.tween_property',
    ]);
  });

  it('finds members by name and classes by their summary', () => {
    const memberHits = library.search('slide', 5);
    const summaryHits = library.search('characters', 5);

    expect(memberHits[0]).toMatchObject({ owner: characterBody, entry: { kind: 'method' } });
    expect(summaryHits[0]).toMatchObject({ owner: characterBody });
    expect(summaryHits[0]?.entry).toBeUndefined();
  });

  it('limits the hits', () => {
    expect(library.search('e', 2)).toHaveLength(2);
  });
});
