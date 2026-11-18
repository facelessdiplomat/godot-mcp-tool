# Crates on the hill

**Request**

> Put ten crates from res://crate.tscn on the hill so that each one rests on the ground, and give the rock a collision that the player cannot walk through.

**Starting point**

The arena with a walking, jumping player, a hill (`MeshInstance3D` with a `PrismMesh`) north of the player and a rock
(`MeshInstance3D` with a `SphereMesh`) to the right of the player. Neither has a collision. `res://crate.tscn` is a
half-meter box.

**Done when**

- The arena holds ten instances of `res://crate.tscn`.
- The bottom of every crate lies within a centimeter of the hill under its center.
- In the running game the player, walking right, stops at the rock.

**Notes**

- `node_add_collision` gives the hill a trimesh collision and the rock a convex or sphere collision; it is also an
  operation of `scene_batch_edit`.
- `node_snap_to_floor` places all crates in one call; `scene_raycast` and `node_get_bounds` check the result.
- Placing crates by guessing heights, or scaling the rock instead of giving it a collision, fails the checks.
- Evaluation run: `server/test/evals/scenarios/cratesOnTheHill.ts`.
