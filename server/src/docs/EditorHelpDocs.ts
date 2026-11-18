import { posix, win32 } from 'node:path';
import * as z from 'zod/v4';
import { type ClassDoc, type MethodDoc, parameterOf } from './ClassDoc.js';

export interface EditorHelp {
  readonly gdscript: ClassDoc | undefined;
  readonly defaults: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

export interface HelpCacheEnvironment {
  readonly platform: NodeJS.Platform;
  readonly homeDirectory: string;
  readonly variables: Readonly<Record<string, string | undefined>>;
  readonly binaryPath: string;
}

export const gdscriptPageName = '@GDScript';

const methodSchema = z.object({
  name: z.string(),
  return_type: z.string().optional(),
  qualifiers: z.string().optional(),
  description: z.string().optional(),
  arguments: z.array(z.object({ name: z.string(), type: z.string().optional(), default_value: z.string().optional() })).optional(),
});

const helpSchema = z.object({
  gdscript: z
    .object({
      name: z.string(),
      brief_description: z.string().optional(),
      description: z.string().optional(),
      annotations: z.array(methodSchema).optional(),
      methods: z.array(methodSchema).optional(),
      constants: z.array(z.object({ name: z.string(), value: z.string().optional(), description: z.string().optional() })).optional(),
    })
    .nullable(),
  defaults: z.record(z.string(), z.record(z.string(), z.string())),
});

export function readEditorHelp(json: unknown): EditorHelp {
  const help = helpSchema.parse(json);
  const page = help.gdscript;
  return {
    gdscript:
      page === null
        ? undefined
        : {
            name: gdscriptPageName,
            origin: 'builtin',
            brief: (page.brief_description ?? '').trim(),
            description: (page.description ?? '').trim(),
            constructors: [],
            properties: [],
            methods: [...(page.annotations ?? []), ...(page.methods ?? [])].map(methodOf),
            signals: [],
            constants: (page.constants ?? []).map((constant) => ({ name: constant.name, value: constant.value ?? '', description: (constant.description ?? '').trim() })),
            enums: [],
          },
    defaults: new Map(Object.entries(help.defaults).map(([className, values]) => [className, new Map(Object.entries(values))])),
  };
}

export function withDefaultValues(classes: readonly ClassDoc[], defaults: ReadonlyMap<string, ReadonlyMap<string, string>>): ClassDoc[] {
  return classes.map((classDoc) => {
    const values = defaults.get(classDoc.name);
    if (values === undefined) {
      return classDoc;
    }
    return {
      ...classDoc,
      properties: classDoc.properties.map((property) => {
        const defaultValue = values.get(property.name);
        return property.defaultValue !== undefined || defaultValue === undefined ? property : { ...property, defaultValue };
      }),
    };
  });
}

export function editorHelpCacheCandidates(environment: HelpCacheEnvironment, versionBranch: string): string[] {
  const paths = environment.platform === 'win32' ? win32 : posix;
  const fileName = `editor_doc_cache-${versionBranch}.res`;
  const systemFolder = systemCacheFolder(environment);
  return [...(systemFolder === undefined ? [] : [paths.join(systemFolder, fileName)]), paths.join(paths.dirname(environment.binaryPath), 'editor_data', 'cache', fileName)];
}

function systemCacheFolder(environment: HelpCacheEnvironment): string | undefined {
  switch (environment.platform) {
    case 'darwin':
      return posix.join(environment.homeDirectory, 'Library', 'Caches', 'Godot');
    case 'win32':
      return environment.variables['LOCALAPPDATA'] === undefined ? undefined : win32.join(environment.variables['LOCALAPPDATA'], 'Godot');
    default:
      return posix.join(environment.variables['XDG_CACHE_HOME'] ?? posix.join(environment.homeDirectory, '.cache'), 'godot');
  }
}

function methodOf(method: z.infer<typeof methodSchema>): MethodDoc {
  return {
    name: method.name,
    returnType: method.return_type ?? 'void',
    qualifiers: (method.qualifiers ?? '').split(' ').filter((qualifier) => qualifier !== ''),
    description: (method.description ?? '').trim(),
    parameters: (method.arguments ?? []).map((argument) => parameterOf(argument.name, argument.type ?? 'Variant', argument.default_value)),
  };
}
