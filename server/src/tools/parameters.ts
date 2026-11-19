import * as z from 'zod/v4';

export const sceneToChange = z
  .string()
  .optional()
  .describe('The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.');

export const sceneToRead = z
  .string()
  .optional()
  .describe('The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.');

export const expandInstances = z
  .boolean()
  .optional()
  .describe('Also include the nodes inside instanced scenes, such as "Enemy2/Mesh", which node_set_properties changes for that instance only. Default: only the instances themselves, and the nodes of instances whose Editable Children is on.');

export const nodePath = z.string().min(1).describe('Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.');

export const maximumNodePaths = 20;

export function nodePaths(description: string): z.ZodOptional<z.ZodArray<z.ZodString>> {
  return z.array(z.string().min(1)).min(1).max(maximumNodePaths).optional().describe(description);
}

interface NodeSelection {
  readonly path?: string | undefined;
  readonly paths?: readonly string[] | undefined;
}

export function requireOneNodeSelection(selection: NodeSelection, context: z.RefinementCtx): void {
  if (selection.path !== undefined && selection.paths !== undefined) {
    context.addIssue({ code: 'custom', message: 'Give path for one node or paths for several, not both.', path: ['paths'] });
  } else if (selection.path === undefined && selection.paths === undefined) {
    context.addIssue({ code: 'custom', message: 'Give path for one node or paths for several.', path: ['path'] });
  }
}

const propertyValuesDescription = [
  'Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}.',
  'Formats: numbers, booleans and text as JSON;',
  'vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees;',
  'colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1;',
  'enums by option name ("Double-Sided") or number; flags as a list of names; physics, render and navigation layers as a list of layer numbers or of the names the project gives them (["world", "enemies", 5]);',
  'resources as a "res://…" path, or {"new": "Class", …properties} to create one;',
  'the items of a Theme as "Button/styles/normal" or "Label/font_sizes/font_size", the points of a curve as "point_count", "point_0/position" and the handles "point_0/in" and "point_0/out", the items of a MeshLibrary as "item/0/name" and "item/0/mesh";',
  'a script as "res://….gd"; node references and node paths, such as node_a of a joint, as paths relative to the node ("../Player") or to the scene root ("Player");',
  'Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too.',
  'A path changes one part only: "mesh:size" a property of the node\'s own mesh, "position:y" one coordinate.',
  'Every value is read back after it is set.',
].join(' ');

export const propertyValues = z.record(z.string(), z.unknown()).describe(propertyValuesDescription);
