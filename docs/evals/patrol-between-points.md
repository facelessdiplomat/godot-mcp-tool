# Patrol between two points

**Request**

> Make the enemy patrol back and forth between the two markers, facing the way it walks.

**Starting point**

A Godot project with the addon enabled and the editor running, and `res://arena.tscn` as the main scene: a 20 × 20 m
floor with collision, a sun and a camera, an `Enemy` (`CharacterBody3D` with a capsule and a box mesh named `Body`,
no script) at the origin, and two `Marker3D` nodes, `PatrolA` at x = −4 and `PatrolB` at x = 4.

**Done when**

- The enemy has a script, saved with the scene, and `script_validate` finds no errors in it.
- In the running game the enemy comes within 0.5 m of `PatrolB` and afterwards within 0.5 m of `PatrolA` again.
- While it walks, the enemy or its `Body` faces the way it moves, and it stays on the floor.

**Notes**

- A good run reads the marker positions with `scene_get_tree` or `node_get_properties`, checks the script with
  `script_validate` before running the game, and confirms the patrol with `game_wait` rather than by guessing.
- Facing the walking direction: `look_at()` on a target at the enemy's own height, or a rotation from `atan2`;
  `look_at()` on the enemy's own position fails.
- Evaluation run: `server/test/evals/scenarios/patrolBetweenPoints.ts`.
