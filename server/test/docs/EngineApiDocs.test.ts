import { describe, expect, it } from 'vitest';
import type { ClassDoc } from '../../src/docs/ClassDoc.js';
import { readEngineDocs } from '../../src/docs/EngineApiDocs.js';

const extensionApi = {
  header: { version_major: 4, version_minor: 8 },
  global_constants: [],
  global_enums: [{ name: 'Key', is_bitfield: false, values: [{ name: 'KEY_SPACE', value: 32, description: 'Space key.' }] }],
  utility_functions: [
    {
      name: 'lerp',
      return_type: 'Variant',
      category: 'math',
      is_vararg: false,
      hash: 1,
      arguments: [
        { name: 'from', type: 'Variant' },
        { name: 'to', type: 'Variant' },
        { name: 'weight', type: 'Variant' },
      ],
      description: 'Linearly interpolates between two values.',
    },
  ],
  builtin_classes: [
    {
      name: 'Vector3',
      indexing_return_type: 'float',
      is_keyed: false,
      members: [{ name: 'x', type: 'float', description: 'The vector\'s X component.' }],
      constants: [{ name: 'UP', type: 'Vector3', value: 'Vector3(0, 1, 0)', description: 'Up unit vector.' }],
      enums: [{ name: 'Axis', values: [{ name: 'AXIS_X', value: 0, description: 'Enumerated value for the X axis.' }] }],
      operators: [],
      methods: [
        {
          name: 'lerp',
          return_type: 'Vector3',
          is_vararg: false,
          is_const: true,
          is_static: false,
          hash: 1,
          arguments: [
            { name: 'to', type: 'Vector3' },
            { name: 'weight', type: 'float' },
          ],
          description: 'Returns the result of the linear interpolation.',
        },
      ],
      constructors: [
        { index: 0, description: 'Constructs a default-initialized [Vector3].' },
        {
          index: 1,
          arguments: [
            { name: 'x', type: 'float' },
            { name: 'y', type: 'float' },
            { name: 'z', type: 'float' },
          ],
          description: 'Returns a [Vector3] with the given components.',
        },
      ],
      has_destructor: false,
      brief_description: 'A 3D vector using floating-point coordinates.',
      description: 'A 3-element structure.',
    },
  ],
  classes: [
    {
      name: 'Node',
      is_refcounted: false,
      is_instantiable: true,
      inherits: 'Object',
      api_type: 'core',
      constants: [{ name: 'NOTIFICATION_READY', value: 13, description: 'Notification received when the node is ready.' }],
      enums: [{ name: 'InternalMode', is_bitfield: false, values: [{ name: 'INTERNAL_MODE_DISABLED', value: 0, description: 'The node is not internal.' }] }],
      methods: [
        { name: '_ready', is_const: false, is_static: false, is_vararg: false, is_virtual: true, hash: 1, description: 'Called when the node is ready.' },
        {
          name: 'add_child',
          is_const: false,
          is_vararg: false,
          is_static: false,
          is_virtual: false,
          hash: 2,
          arguments: [
            { name: 'node', type: 'Node' },
            { name: 'force_readable_name', type: 'bool', default_value: 'false' },
            { name: 'internal', type: 'enum::Node.InternalMode', default_value: '0' },
          ],
          description: 'Adds a child [param node].',
        },
        { name: 'get_children', is_const: true, is_vararg: false, is_static: false, is_virtual: false, hash: 3, return_value: { type: 'typedarray::Node' }, description: 'Returns all children.' },
        { name: 'set_process_mode', is_const: false, is_vararg: false, is_static: false, is_virtual: false, hash: 4, arguments: [{ name: 'mode', type: 'enum::Node.ProcessMode' }], description: '' },
      ],
      signals: [{ name: 'child_entered_tree', arguments: [{ name: 'node', type: 'Node' }], description: 'Emitted when a child enters the tree.' }],
      properties: [
        { type: 'StringName', name: 'name', setter: 'set_name', getter: 'get_name', description: 'The name of the node.' },
        { type: 'int', name: 'process_mode', setter: 'set_process_mode', getter: 'get_process_mode', description: 'The node\'s processing behavior.' },
      ],
      brief_description: 'Base class for all scene objects.',
      description: 'Nodes are Godot\'s building blocks.',
    },
    {
      name: 'Control',
      is_refcounted: false,
      is_instantiable: true,
      inherits: 'CanvasItem',
      api_type: 'core',
      properties: [{ type: 'bitfield::Control.SizeFlags', name: 'size_flags_horizontal', setter: 'set_h_size_flags', getter: 'get_h_size_flags', description: 'Tells the parent how to size this node.' }],
      brief_description: 'Base class for all GUI controls.',
      description: '',
    },
  ],
  singletons: [{ name: 'Input', type: 'Input' }],
};

function classNamed(classes: readonly ClassDoc[], name: string): ClassDoc {
  const found = classes.find((classDoc) => classDoc.name === name);
  if (found === undefined) {
    throw new Error(`${name} is missing`);
  }
  return found;
}

describe('readEngineDocs', () => {
  const classes = readEngineDocs(extensionApi);

  it('reads engine classes with their members', () => {
    const node = classNamed(classes, 'Node');

    expect(node).toMatchObject({ name: 'Node', inherits: 'Object', origin: 'engine', brief: 'Base class for all scene objects.' });
    expect(node.methods.slice(0, 3)).toEqual([
      { name: '_ready', returnType: 'void', parameters: [], qualifiers: ['virtual'], description: 'Called when the node is ready.' },
      {
        name: 'add_child',
        returnType: 'void',
        parameters: [
          { name: 'node', type: 'Node' },
          { name: 'force_readable_name', type: 'bool', defaultValue: 'false' },
          { name: 'internal', type: 'Node.InternalMode', defaultValue: '0' },
        ],
        qualifiers: [],
        description: 'Adds a child [param node].',
      },
      { name: 'get_children', returnType: 'Array[Node]', parameters: [], qualifiers: ['const'], description: 'Returns all children.' },
    ]);
    expect(node.properties).toEqual([
      { name: 'name', type: 'StringName', setter: 'set_name', getter: 'get_name', description: 'The name of the node.' },
      { name: 'process_mode', type: 'Node.ProcessMode', setter: 'set_process_mode', getter: 'get_process_mode', description: "The node's processing behavior." },
    ]);
    expect(node.signals).toEqual([{ name: 'child_entered_tree', parameters: [{ name: 'node', type: 'Node' }], description: 'Emitted when a child enters the tree.' }]);
    expect(node.constants).toEqual([{ name: 'NOTIFICATION_READY', value: '13', description: 'Notification received when the node is ready.' }]);
    expect(node.enums).toEqual([
      { name: 'InternalMode', isBitfield: false, values: [{ name: 'INTERNAL_MODE_DISABLED', value: '0', description: 'The node is not internal.' }] },
    ]);
  });

  it('writes flag types without their prefix', () => {
    expect(classNamed(classes, 'Control').properties[0]?.type).toBe('Control.SizeFlags');
  });

  it('reads built-in types with their components, constants and constructors', () => {
    const vector = classNamed(classes, 'Vector3');

    expect(vector.inherits).toBeUndefined();
    expect(vector.origin).toBe('builtin');
    expect(vector.properties).toEqual([{ name: 'x', type: 'float', description: "The vector's X component." }]);
    expect(vector.constants).toEqual([{ name: 'UP', value: 'Vector3(0, 1, 0)', description: 'Up unit vector.' }]);
    expect(vector.constructors.map((constructor) => constructor.parameters.map((parameter) => parameter.name))).toEqual([[], ['x', 'y', 'z']]);
    expect(vector.methods[0]).toMatchObject({ name: 'lerp', returnType: 'Vector3', qualifiers: ['const'] });
  });

  it('gathers global functions and enums in @GlobalScope', () => {
    const globalScope = classNamed(classes, '@GlobalScope');

    expect(globalScope.methods.map((method) => method.name)).toEqual(['lerp']);
    expect(globalScope.enums.map((enumeration) => enumeration.name)).toEqual(['Key']);
  });
});
