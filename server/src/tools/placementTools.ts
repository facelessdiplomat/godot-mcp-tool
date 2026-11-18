import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { editableChildrenSchema, withEditableChildrenSentence } from './formatting/editableChildren.js';
import { formatNodePath } from './formatting/propertyReports.js';
import { nodePath, sceneToChange } from './parameters.js';
import { textResult } from './results.js';

const worldPoint = z.tuple([z.number(), z.number(), z.number()]);

const raycastSchema = z.object({
  scene: z.string(),
  from: z.string(),
  to: z.string(),
  hit: z.boolean(),
  position: z.string().optional(),
  normal: z.string().optional(),
  distance: z.number().optional(),
  node: z.string().optional(),
  type: z.string().optional(),
  by: z.enum(['collision', 'mesh']).optional(),
});

type Raycast = z.infer<typeof raycastSchema>;

const sceneRaycastInput = z.object({
  from: worldPoint.describe('Where the ray starts, [x, y, z] in world coordinates, such as [0, 10, 0].'),
  to: worldPoint.optional().describe('Where the ray ends. Default: 1000 m straight down from "from", to find the ground under a point.'),
  exclude: z.array(z.string().min(1)).optional().describe('Nodes the ray passes through, with their children, such as the node being placed.'),
  in_game: z.boolean().default(false).describe('Cast in the running game instead, against its current state. Needs a game started with game_run.'),
  scene: z
    .string()
    .optional()
    .describe('The scene to cast in, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.'),
});

export function createSceneRaycastTool(editor: EditorGateway): BridgeTool<typeof sceneRaycastInput, Raycast> {
  return new BridgeTool(editor, {
    name: 'scene_raycast',
    definition: {
      title: 'Cast a ray',
      description:
        'Cast a ray through a 3D scene and return the first thing it hits: the position, the surface normal, the distance and the node, whether a collision shape or a visible mesh without collision. Straight down by default, to find the ground under a point; between two points to check a line of sight, such as whether an enemy sees the player. With in_game, cast in the running game.',
      inputSchema: sceneRaycastInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'scene.raycast',
    responseSchema: raycastSchema,
    present: (cast) => textResult(describeRaycast(cast)),
  });
}

function describeRaycast(cast: Raycast): string {
  if (!cast.hit || cast.node === undefined) {
    return `The ray from ${cast.from} to ${cast.to} in ${cast.scene === '' ? 'the running game' : cast.scene} hits nothing.`;
  }
  const surface = cast.by === 'mesh' ? ' It hit the visible mesh, which has no collision shape there.' : '';
  return `The ray from ${cast.from} hits ${formatNodePath(cast.node)} (${cast.type ?? 'Node'}) at ${cast.position ?? '?'}, ${String(cast.distance ?? 0)} m away, with the normal ${cast.normal ?? '?'}.${surface}`;
}

const snappedNodeSchema = z.object({
  path: z.string(),
  moved: z.boolean(),
  rise: z.number().optional(),
  on: z.string().optional(),
  by: z.enum(['collision', 'mesh']).optional(),
  position: z.string().optional(),
  reason: z.string().optional(),
});

const snappedNodesSchema = z.object({ scene: z.string(), nodes: z.array(snappedNodeSchema), editable_children: editableChildrenSchema });

type SnappedNodes = z.infer<typeof snappedNodesSchema>;

const nodeSnapToFloorInput = z.object({
  paths: z.array(z.string().min(1)).min(1).describe('The 3D nodes to place, such as ["Crate", "Props/Barrel"].'),
  scene: z
    .string()
    .optional()
    .describe('The scene to change, as a res:// path or "main"; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.'),
});

export function createNodeSnapToFloorTool(editor: EditorGateway): BridgeTool<typeof nodeSnapToFloorInput, SnappedNodes> {
  return new BridgeTool(editor, {
    name: 'node_snap_to_floor',
    definition: {
      title: 'Place on the floor',
      description:
        'Move 3D nodes straight down or up until the bottom of each rests on what is below it, a collision shape or a visible mesh, as Snap Object to Floor in the editor does, as one Undo step. The bottom comes from the collision shapes of the node, or from its meshes when it has none. Use it to put props on uneven ground or on top of other objects.',
      inputSchema: nodeSnapToFloorInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'node.snap_to_floor',
    responseSchema: snappedNodesSchema,
    present: (snapped) => textResult(withEditableChildrenSentence(describeSnap(snapped), snapped.editable_children)),
  });
}

function describeSnap(snapped: SnappedNodes): string {
  const lines = [`Placed nodes on what is below them in ${snapped.scene}, as one Undo step. The scene has unsaved changes.`];
  for (const node of snapped.nodes) {
    if (!node.moved) {
      lines.push(`${formatNodePath(node.path)} stays where it is: ${node.reason ?? 'nothing is below it'}.`);
      continue;
    }
    const rise = node.rise ?? 0;
    const movement = rise === 0 ? 'already rested' : `moved ${rise < 0 ? 'down' : 'up'} ${String(Math.abs(rise))} m and rests`;
    lines.push(`${formatNodePath(node.path)} ${movement} on ${formatNodePath(node.on ?? '?')}, now at ${node.position ?? '?'}.`);
  }
  return lines.join('\n');
}

export const addedCollisionSchema = z.object({
  scene: z.string(),
  path: z.string(),
  shapes: z.array(z.object({ path: z.string(), type: z.string() })),
  mesh_size: z.string(),
  collision_size: z.string(),
  editable_children: editableChildrenSchema,
});

type AddedCollision = z.infer<typeof addedCollisionSchema>;

export const nodeAddCollisionInput = z.object({
  path: nodePath,
  shape: z
    .enum(['trimesh', 'convex', 'simplified_convex', 'multiple_convex', 'box', 'capsule', 'cylinder', 'sphere'])
    .describe(
      'trimesh follows every triangle and suits static level geometry; convex and simplified_convex wrap the mesh in one convex hull; multiple_convex splits it into up to 32 hulls for concave moving objects; box, capsule, cylinder and sphere fit a primitive to the mesh.',
    ),
  placement: z
    .enum(['static_body', 'sibling'])
    .default('static_body')
    .describe('static_body (default) adds a StaticBody3D child with the shapes, so that bodies cannot pass through the mesh; sibling adds CollisionShape3D nodes next to the mesh, for a mesh that is already part of a physics body.'),
  axis: z.enum(['longest', 'x', 'y', 'z']).optional().describe('The axis of a capsule or a cylinder fitted to a mesh that is not one. Default: the longest side of the mesh.'),
  scene: sceneToChange,
});

export function createNodeAddCollisionTool(editor: EditorGateway): BridgeTool<typeof nodeAddCollisionInput, AddedCollision> {
  return new BridgeTool(editor, {
    name: 'node_add_collision',
    definition: {
      title: 'Add collision from a mesh',
      description:
        'Give a MeshInstance3D a collision built from its mesh, as Mesh → Create Collision Shape in the editor does, as one Undo step, so that players and other bodies cannot pass through it. The result compares the size of the collision with the size of the mesh. CSG nodes take use_collision instead, and imported models their import settings.',
      inputSchema: nodeAddCollisionInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'node.add_collision',
    responseSchema: addedCollisionSchema,
    present: (added, input) => textResult(withEditableChildrenSentence(describeAddedCollision(added, input.shape), added.editable_children)),
  });
}

export function summarizeAddedCollision(added: { readonly path: string; readonly shapes: readonly { readonly type: string }[] }): string {
  return `Gave ${formatNodePath(added.path)} a collision of ${String(added.shapes.length)} ${added.shapes.length === 1 ? 'shape' : 'shapes'}`;
}

function describeAddedCollision(added: AddedCollision, shape: string): string {
  const shapes = added.shapes.map((created) => `${created.path} (${created.type})`).join(', ');
  return [
    `Added a ${shape.replace('_', ' ')} collision to ${formatNodePath(added.path)} in ${added.scene} as one Undo step: ${shapes}. The scene has unsaved changes.`,
    `The collision measures ${added.collision_size}; the mesh measures ${added.mesh_size}.`,
  ].join('\n');
}
