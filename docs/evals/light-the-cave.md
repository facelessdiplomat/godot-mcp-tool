# Light the cave

**Request**

> The cave in res://cave.tscn is pitch black inside when the game runs, although a VoxelGI covers it to bounce the
> sunlight from the entrance into it. Make the VoxelGI light the cave, without adding any lights, so that the game
> starts with the back of the cave lit.

**Starting point**

`res://cave.tscn`, the main scene:

- a cave of `CSGBox3D` shapes in a `CSGCombiner3D`: a rock of 10 × 6 × 14 m, a hollow of 8 × 4 × 12 m inside it, and
  an entrance cut into its front wall, toward +Z;
- a sun (`DirectionalLight3D` with shadows) that shines into the entrance from above, at 35°;
- an environment with a sky and with neither ambient nor reflected light;
- a `VoxelGI` that covers the cave but holds no data;
- a camera inside, by the entrance, that looks at the back wall.

The sun lights a patch of floor behind the entrance, and the rest of the cave stays black: a `VoxelGI` bounces light
only once it is baked.

**Done when**

- The `VoxelGI` keeps baked data in the saved `cave.tscn`.
- The scene has no light but the sun.
- When the game starts, the back of the cave, as the camera sees it, is lit: [39, 34, 27] on average with the
  reference solution, black when nothing is done.
- The game runs without errors.

**Notes**

- `voxelgi_bake` bakes the `VoxelGI` as the Bake button of the editor does, which saves the `VoxelGIData` next to
  the scene, as `cave.VoxelGI_data.res`, so that the scene does not hold the data as Base64. At the pinned commit
  `LightmapGI` and `OccluderInstance3D` have no bake method for scripts.
- The reference solution bakes with `voxelgi_bake` and saves the scene. Another solution bakes from the running
  game, which may write into `res://` when the editor runs it: a one-off script on the `VoxelGI` calls `bake()` and
  saves `data` with `ResourceSaver`. After the run the `VoxelGI` gets the saved file as its `data`, and the script
  goes.
- Other ways fail a check on purpose: SDFGI in the environment lights the cave without the `VoxelGI`, a lamp is a
  light that the request rules out, and a script that bakes at every start leaves no data in the scene.
- This is the scenario of task T24. The first run with an agent on 2026-11-19, before `voxelgi_bake`, passed (4/4,
  34 calls, $0.97) by a detour in the editor: an `@tool` script that bakes in `_ready()`, run by closing the scene
  and opening it again. That detour made the case for the tool; the rerun with it passed with 17 calls for $0.38.
- Evaluation run: `server/test/evals/scenarios/lightTheCave.ts`.
