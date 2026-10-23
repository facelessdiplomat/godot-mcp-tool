# Extract an enemy scene

**Request**

> The arena has three enemies built by hand. Turn one of them into a reusable enemy scene and replace all three with instances of it, keeping their positions.

**Starting point**

The arena with three `CharacterBody3D` enemies built in place, each with a capsule, a box mesh and the script
`res://enemy.gd`, at (−5, 0, −5), (0, 0, −6) and (5, 0, −5).

**Done when**

- A scene of its own has a `CharacterBody3D` root with `enemy.gd` and the enemy's children.
- The arena has three instances of it at the original positions, and no enemy built in place.
- The game runs without errors, and the scripts have no errors.

**Notes**

- A good run builds the enemy scene with `scene_create` and one `scene_batch_edit`, then swaps the three enemies in
  one `scene_batch_edit` of the arena (`node_delete` and `node_add` with the scene's path as the type).
- Evaluation run: `server/test/evals/scenarios/extractEnemyScene.ts`.
