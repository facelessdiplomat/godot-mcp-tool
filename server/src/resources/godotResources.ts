import type { Tool } from '../tools/Tool.js';
import type { McpResource } from './McpResource.js';
import { ToolViewResource } from './ToolViewResource.js';

export interface GodotResourceSources {
  readonly projectInfo: Tool;
  readonly sceneTree: Tool;
  readonly classDocs: Tool;
  readonly lastRunOutput: Tool;
  readonly listScenes: () => readonly string[];
}

const resourcePrefix = 'res://';
const sceneUriPrefix = 'godot://scene/';
const lastRunEntries = 200;

export function createGodotResources(sources: GodotResourceSources): McpResource[] {
  return [
    new ToolViewResource(
      {
        name: 'project',
        uri: 'godot://project',
        title: 'Project overview',
        description: 'The Godot project: main scene, renderer, window, autoloads, plugins, global classes and the indentation of .gd files, as project_info shows it.',
      },
      sources.projectInfo,
      () => ({}),
    ),
    new ToolViewResource(
      {
        name: 'scene',
        uri: 'godot://scene/{+path}',
        title: 'Scene tree',
        description: 'The node tree of a scene of the project, such as godot://scene/levels/arena.tscn, as scene_get_tree shows it.',
      },
      sources.sceneTree,
      ({ path }) => ({ scene: `${resourcePrefix}${decodeURIComponent(path ?? '')}` }),
      () => sources.listScenes().map((scene) => ({ uri: `${sceneUriPrefix}${encodeURI(scene.slice(resourcePrefix.length))}`, name: scene })),
    ),
    new ToolViewResource(
      {
        name: 'docs',
        uri: 'godot://docs/{class}',
        title: 'Class reference',
        description: 'The reference of an engine class or a class_name of the project in the installed Godot, such as godot://docs/CharacterBody3D, as docs_class shows it.',
      },
      sources.classDocs,
      ({ class: className }) => ({ name: decodeURIComponent(className ?? '') }),
    ),
    new ToolViewResource(
      {
        name: 'last-run',
        uri: 'godot://logs/last-run',
        title: 'Output of the last game run',
        description: 'What the last game run printed from its start: messages, warnings and errors with file, line and stack, as game_get_output shows it.',
      },
      sources.lastRunOutput,
      () => ({ from_start: true, max_entries: lastRunEntries }),
    ),
  ];
}
