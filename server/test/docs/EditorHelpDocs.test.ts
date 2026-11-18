import { describe, expect, it } from 'vitest';
import type { ClassDoc } from '../../src/docs/ClassDoc.js';
import { editorHelpCacheCandidates, gdscriptPageName, readEditorHelp, withDefaultValues } from '../../src/docs/EditorHelpDocs.js';

const help = {
  gdscript: {
    name: '@GDScript',
    brief_description: 'Built-in GDScript constants, functions, and annotations.',
    description: 'A list of utility functions and annotations accessible from any script.',
    annotations: [
      {
        name: '@export_range',
        return_type: 'void',
        qualifiers: 'vararg',
        description: 'Export an [int] or [float] property as a range value.',
        arguments: [
          { name: 'min', type: 'float' },
          { name: 'max', type: 'float' },
          { name: 'step', type: 'float', default_value: '1.0' },
        ],
      },
    ],
    methods: [{ name: 'preload', return_type: 'Resource', description: 'Returns a [Resource] from the filesystem located at [param path].', arguments: [{ name: 'path', type: 'String' }] }],
    constants: [{ name: 'PI', value: '3.14159265358979', description: 'Constant that represents how many times the diameter of a circle fits around its perimeter.' }],
  },
  defaults: { Node3D: { position: 'Vector3(0, 0, 0)', visible: 'true' } },
};

const node3d: ClassDoc = {
  name: 'Node3D',
  origin: 'engine',
  brief: '',
  description: '',
  constructors: [],
  properties: [
    { name: 'position', type: 'Vector3', description: '' },
    { name: 'basis', type: 'Basis', description: '' },
  ],
  methods: [],
  signals: [],
  constants: [],
  enums: [],
};

describe('the help of the editor', () => {
  it('turns the @GDScript page into a class with its annotations and functions', () => {
    const page = readEditorHelp(help).gdscript;

    expect(page?.name).toBe(gdscriptPageName);
    expect(page?.brief).toBe('Built-in GDScript constants, functions, and annotations.');
    expect(page?.methods.map((method) => method.name)).toEqual(['@export_range', 'preload']);
    expect(page?.methods[0]).toEqual({
      name: '@export_range',
      returnType: 'void',
      qualifiers: ['vararg'],
      description: 'Export an [int] or [float] property as a range value.',
      parameters: [
        { name: 'min', type: 'float' },
        { name: 'max', type: 'float' },
        { name: 'step', type: 'float', defaultValue: '1.0' },
      ],
    });
    expect(page?.constants).toEqual([{ name: 'PI', value: '3.14159265358979', description: 'Constant that represents how many times the diameter of a circle fits around its perimeter.' }]);
  });

  it('gives engine properties their default values', () => {
    const [withDefaults] = withDefaultValues([node3d], readEditorHelp(help).defaults);

    expect(withDefaults?.properties).toEqual([
      { name: 'position', type: 'Vector3', description: '', defaultValue: 'Vector3(0, 0, 0)' },
      { name: 'basis', type: 'Basis', description: '' },
    ]);
  });

  it('looks for the help cache where the editor writes it on each system', () => {
    expect(editorHelpCacheCandidates({ platform: 'darwin', homeDirectory: '/Users/ada', variables: {}, binaryPath: '/Applications/Godot.app/Contents/MacOS/Godot' }, '4.8')).toEqual([
      '/Users/ada/Library/Caches/Godot/editor_doc_cache-4.8.res',
      '/Applications/Godot.app/Contents/MacOS/editor_data/cache/editor_doc_cache-4.8.res',
    ]);
    expect(editorHelpCacheCandidates({ platform: 'linux', homeDirectory: '/home/ada', variables: { XDG_CACHE_HOME: '/var/cache/ada' }, binaryPath: '/opt/godot' }, '4.7')[0]).toBe(
      '/var/cache/ada/godot/editor_doc_cache-4.7.res',
    );
    expect(editorHelpCacheCandidates({ platform: 'win32', homeDirectory: 'C:\\Users\\ada', variables: { LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local' }, binaryPath: 'C:\\godot.exe' }, '4.8')[0]).toContain(
      'Godot',
    );
  });
});
