# Blocks from a scene

**Request**

> Turn the blocks of res://blocks/blocks.tscn into a MeshLibrary saved as res://blocks/blocks.tres, keeping their collision, give it to the GridMap of res://yard.tscn and pave the yard with it: Grass on every cell from (0, 0, 0) to (9, 0, 9), but a Stone on each of the four corners.

**Starting point**

`res://blocks/blocks.tscn` holds two blocks, `Grass` (2 × 0.5 × 2 m) and `Stone` (2 × 2 × 2 m), each a
`MeshInstance3D` with a `StaticBody3D` and a box collision below it. The yard (`res://yard.tscn`, the main scene) has
an empty `GridMap` named `Ground` without a mesh library, and a ball (`Probe`) above the cell (2, 0, 2) that falls when
the game runs.

**Done when**

- The GridMap of the yard uses `res://blocks/blocks.tres`, a `MeshLibrary` with a Grass and a Stone item, each with
  its mesh and its collision shapes.
- The yard has 100 cells, 96 of Grass and 4 of Stone on the corners, and the ball comes to rest on the blocks.

**Notes**

- This is what the editor's Scene → Export As → MeshLibrary does. Without that step a run builds the library item by
  item with `resource_create`, such as `"item/0/name"`, `"item/0/mesh"` and `"item/0/shapes"`, or writes it as a new
  file; how agents do it decides whether a tool is needed (T14 of the plan for the next version).
- Evaluation run: `server/test/evals/scenarios/blocksFromAScene.ts`.
