import * as z from 'zod/v4';

export const sceneToChange = z
  .string()
  .optional()
  .describe('The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.');

export const sceneToRead = z
  .string()
  .optional()
  .describe('The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.');

export const nodePath = z.string().min(1).describe('Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.');

const propertyValuesDescription = [
  'Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}.',
  'Formats: numbers, booleans and text as JSON;',
  'vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees;',
  'colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1;',
  'enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]);',
  'resources as a "res://…" path, or {"new": "Class", …properties} to create one;',
  'a script as "res://….gd"; node references as paths relative to the node ("../Player");',
  'Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too.',
  'Every value is read back after it is set.',
].join(' ');

export const propertyValues = z.record(z.string(), z.unknown()).describe(propertyValuesDescription);
