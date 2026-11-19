import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import * as z from 'zod/v4';
import { DiscoveryFileReader } from '../bridge/DiscoveryFileReader.js';
import { findProjectContaining } from '../project/ProjectLocator.js';
import { toResourcePath } from '../project/ProjectFiles.js';

export type SceneEditOutcome = { readonly kind: 'silent' } | { readonly kind: 'denied'; readonly reason: string };

const guardedExtensions = ['.tscn', '.tres'];
const silent: SceneEditOutcome = { kind: 'silent' };
const fileEditSchema = z.object({ tool_input: z.object({ file_path: z.string().min(1) }) });

export class SceneEditGuard {
  constructor(private readonly isProcessAlive: (pid: number) => boolean) {}

  check(hookInput: unknown): SceneEditOutcome {
    const edit = fileEditSchema.safeParse(hookInput);
    if (!edit.success) {
      return silent;
    }
    const filePath = edit.data.tool_input.file_path;
    if (!guardedExtensions.some((extension) => filePath.endsWith(extension)) || !existsSync(filePath)) {
      return silent;
    }
    const projectRoot = findProjectContaining(filePath);
    if (projectRoot === undefined || new DiscoveryFileReader(projectRoot, this.isProcessAlive).read().kind !== 'found') {
      return silent;
    }
    return { kind: 'denied', reason: refusalOf(toResourcePath(relative(projectRoot, filePath))) };
  }
}

function refusalOf(resourcePath: string): string {
  return [
    `${resourcePath} was not changed: the Godot editor is open on this project and keeps its own copy of`,
    'scenes and resources, so a text edit would break their references or be overwritten when the editor saves.',
    'Change it through the editor with the godot tools instead: scene_batch_edit and the node_ tools for nodes,',
    'properties and signals of a scene, resource_create and resource_set_properties for resources,',
    'audio_buses_set for a bus layout, tileset_add_atlas for a TileSet. Read it first with scene_get_tree,',
    'node_get_properties or resource_get.',
  ].join(' ');
}
