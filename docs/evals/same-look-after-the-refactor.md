# Same look after the refactor

**Request**

> The twelve crates of the arena are separate MeshInstance3D nodes, each with its own copy of the same mesh and material. Make them instances of one crate scene, res://props/crate.tscn, so that a change of the crate changes them all. The arena must look exactly as it does now.

**Starting point**

An arena (`res://arena.tscn`, the main scene) with a floor, a sun with shadows, an environment and twelve crates
(`Crate1` to `Crate12`), each a `MeshInstance3D` with its own `BoxMesh` and brown `StandardMaterial3D`, turned by
different angles. A picture of the arena from a fixed view, taken before the run, lies in
`res://.reference/level.png`. The editor runs with a window.

**Done when**

- The arena holds twelve instances of `res://props/crate.tscn`, at the positions of the old crates.
- `editor_screenshot` of the same view, compared with the picture from before, finds no pixel that changed by more
  than the default tolerance.

**Notes**

- A good run saves one crate as a scene with `node_save_as_scene`, replaces the others by instances at their
  transforms in one `scene_batch_edit`, and compares a view before and after with `compare_to` instead of looking at
  two pictures.
- Evaluation run: `server/test/evals/scenarios/sameLookAfterTheRefactor.ts`.
