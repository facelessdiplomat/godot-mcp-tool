import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { applyReportSchema, formatApplyReport, formatNodePath, formatValue } from './formatting/propertyReports.js';
import { errorResult, textResult } from './results.js';

export const autoloadSchema = z.object({ name: z.string(), path: z.string(), singleton: z.boolean() });

type Autoload = z.infer<typeof autoloadSchema>;

const projectInfoSchema = z.object({
  name: z.string(),
  path: z.string(),
  main_scene: z.string(),
  features: z.array(z.string()),
  renderer: z.string(),
  physics_engine_3d: z.string(),
  window: z.object({ width: z.number(), height: z.number(), stretch_mode: z.string(), stretch_aspect: z.string() }),
  autoloads: z.array(autoloadSchema),
  enabled_plugins: z.array(z.string()),
  global_classes: z.array(z.object({ name: z.string(), base: z.string(), path: z.string() })),
  global_class_count: z.number().int(),
  indentation: z.object({ style: z.enum(['tabs', 'spaces']), size: z.number().int() }),
  folders: z.array(z.string()),
});

type ProjectInfo = z.infer<typeof projectInfoSchema>;

const settingsReadSchema = z.object({
  settings: z.array(z.object({ name: z.string(), value: z.unknown() })),
  unknown: z.array(z.object({ name: z.string(), reason: z.string() })),
  truncated: z.boolean(),
});

type SettingsRead = z.infer<typeof settingsReadSchema>;

const settingsWriteSchema = applyReportSchema.extend({ previous: z.record(z.string(), z.unknown()) });

type SettingsWrite = z.infer<typeof settingsWriteSchema>;

const rescanSchema = z.object({ duration_ms: z.number() });

type Rescan = z.infer<typeof rescanSchema>;

const rescanTimeoutMs = 90_000;

const projectInfoInput = z.object({});

export function createProjectInfoTool(editor: EditorGateway): BridgeTool<typeof projectInfoInput, ProjectInfo> {
  return new BridgeTool(editor, {
    name: 'project_info',
    definition: {
      title: 'Project overview',
      description:
        'Summarize the Godot project: name, main scene, renderer, 3D physics engine, window size, autoloads, enabled plugins, global classes (class_name), the indentation style of .gd files and the top-level folders. Call it once when starting work on a project.',
      inputSchema: projectInfoInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'project.info',
    responseSchema: projectInfoSchema,
    present: (info) => textResult(describeProject(info)),
  });
}

function describeProject(info: ProjectInfo): string {
  return [
    `Project: ${info.name}`,
    `Path: ${info.path}`,
    `Main scene: ${info.main_scene === '' ? 'not set; set application/run/main_scene with project_settings_set' : info.main_scene}`,
    `Renderer: ${info.renderer}; 3D physics: ${info.physics_engine_3d}`,
    `Window: ${String(info.window.width)}×${String(info.window.height)}, stretch mode ${info.window.stretch_mode}, aspect ${info.window.stretch_aspect}`,
    `Indentation in .gd files: ${info.indentation.style === 'tabs' ? 'tabs' : `${String(info.indentation.size)} spaces`} — never mix tabs and spaces`,
    `Autoloads: ${formatAutoloads(info.autoloads)}`,
    `Enabled plugins: ${listOrNone(info.enabled_plugins)}`,
    describeGlobalClasses(info),
    `Top-level folders: ${listOrNone(info.folders)}`,
  ].join('\n');
}

function describeGlobalClasses(info: ProjectInfo): string {
  if (info.global_class_count === 0) {
    return 'Global classes: none';
  }
  const shown = info.global_classes.map((globalClass) => `${globalClass.name} extends ${globalClass.base} (${globalClass.path})`).join('; ');
  const count =
    info.global_classes.length < info.global_class_count
      ? `${String(info.global_class_count)}, the first ${String(info.global_classes.length)} shown, the project's own before those of addons`
      : String(info.global_class_count);
  return `Global classes (${count}): ${shown}`;
}

export function formatAutoloads(autoloads: readonly Autoload[]): string {
  return listOrNone(autoloads.map((autoload) => `${autoload.name} → ${autoload.path}${autoload.singleton ? '' : ' (no global name)'}`));
}

function listOrNone(items: readonly string[]): string {
  return items.length === 0 ? 'none' : items.join(', ');
}

const projectSettingsGetInput = z.object({
  names: z.array(z.string()).optional().describe('Full setting names, such as ["application/run/main_scene", "display/window/size/viewport_width"].'),
  prefix: z.string().optional().describe('Read every setting whose name starts with this, such as "display/window/".'),
});

export function createProjectSettingsGetTool(editor: EditorGateway): BridgeTool<typeof projectSettingsGetInput, SettingsRead> {
  return new BridgeTool(editor, {
    name: 'project_settings_get',
    definition: {
      title: 'Read project settings',
      description:
        'Read project settings (project.godot) by full name or by prefix. Pass names, prefix or both. Unknown names come back with similar existing names.',
      inputSchema: projectSettingsGetInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'project.settings_get',
    responseSchema: settingsReadSchema,
    present: (result) => textResult(describeSettings(result)),
  });
}

function describeSettings(result: SettingsRead): string {
  const lines = [
    ...result.settings.map((setting) => `${setting.name} = ${formatValue(setting.value)}`),
    ...result.unknown.map((unknown) => `${unknown.name}: ${unknown.reason}`),
  ];
  if (result.truncated) {
    lines.push(`Only the first ${String(result.settings.length)} settings are shown; use a longer prefix to see the rest.`);
  }
  return lines.length > 0 ? lines.join('\n') : 'No project settings match.';
}

const projectSettingsSetInput = z.object({
  values: z
    .record(z.string(), z.unknown())
    .describe(
      'Setting names mapped to new values, such as {"application/run/main_scene": "res://levels/arena.tscn"}. Values use the same formats as node properties.',
    ),
});

export function createProjectSettingsSetTool(editor: EditorGateway): BridgeTool<typeof projectSettingsSetInput, SettingsWrite> {
  return new BridgeTool(editor, {
    name: 'project_settings_set',
    definition: {
      title: 'Change project settings',
      description:
        'Change project settings and save project.godot, for example the main scene (application/run/main_scene) or the window size. Each value is read back; the result lists what applied and the previous values, so the change can be reverted.',
      inputSchema: projectSettingsSetInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'project.settings_set',
    responseSchema: settingsWriteSchema,
    present: (result) => {
      const previousValues = Object.entries(result.previous);
      if (previousValues.length === 0) {
        return errorResult(`project.godot was not changed.\n${formatApplyReport(result)}`);
      }
      const previousText = previousValues.map(([name, value]) => `${name} = ${formatValue(value)}`).join('; ');
      return textResult(`Saved project.godot.\n${formatApplyReport(result)}\nPrevious values: ${previousText}`);
    },
  });
}

const editorRescanInput = z.object({});

export function createEditorRescanTool(editor: EditorGateway): BridgeTool<typeof editorRescanInput, Rescan> {
  return new BridgeTool(editor, {
    name: 'editor_rescan',
    definition: {
      title: 'Rescan project files',
      description:
        'Make the editor pick up files changed outside it, such as scripts, scenes or assets written to disk: rescan the project, import new assets and reload changed scripts. Call it after writing files and before using them in scenes.',
      inputSchema: editorRescanInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'editor.rescan',
    responseSchema: rescanSchema,
    timeoutMs: rescanTimeoutMs,
    present: ({ duration_ms }) =>
      textResult(`The editor rescanned the project files in ${String(duration_ms)} ms and reloaded scripts changed on disk.`),
  });
}

const selectionSchema = z.union([z.object({ scene: z.string(), nodes: z.array(z.string()) }), z.object({ file: z.string() })]);

type Selection = z.infer<typeof selectionSchema>;

const editorSelectInput = z.object({
  nodes: z.array(z.string().min(1)).optional().describe('Paths of the nodes to select in the scene tree, such as ["Player", "Player/Camera"].'),
  scene: z.string().optional().describe('The scene of the nodes, as a res:// path; the editor switches to it. Default: the scene open in the editor.'),
  file: z.string().min(1).optional().describe('A file or folder to select in the FileSystem dock instead, such as "res://materials/ice.tres".'),
});

export function createEditorSelectTool(editor: EditorGateway): BridgeTool<typeof editorSelectInput, Selection> {
  return new BridgeTool(editor, {
    name: 'editor_select',
    definition: {
      title: 'Select in the editor',
      description:
        'Select nodes in the scene tree of the editor, or a file in its FileSystem dock, to show the user what you are talking about; the inspector shows what is selected. Changes nothing in the project.',
      inputSchema: editorSelectInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'editor.select',
    responseSchema: selectionSchema,
    present: (selection) =>
      textResult(
        'file' in selection
          ? `Selected ${selection.file} in the FileSystem dock of the editor.`
          : `Selected ${selection.nodes.map(formatNodePath).join(', ')} in ${selection.scene} in the editor.`,
      ),
  });
}
