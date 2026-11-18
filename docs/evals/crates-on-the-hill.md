# Crates on the hill

**Request**

> Put ten crates from res://crate.tscn on the hill so that each one rests on the ground, and give the rock a collision that the player cannot walk through.

**Starting point**

The arena with a walking, jumping player, a hill (`MeshInstance3D` with a `PrismMesh`) north of the player and a rock
(`MeshInstance3D` with a `SphereMesh`) to the right of the player. Neither has a collision. `res://crate.tscn` is a
half-meter box.

**Done when**

- The arena holds ten instances of `res://crate.tscn`.
- Every crate lies flat on the hill: in the running game, the four corners of its bottom are within a centimeter of
  the slope.
- In the running game the player, walking right, stops at the rock.

**Notes**

- `node_add_collision` gives the hill a trimesh collision and the rock a convex or sphere collision; it is also an
  operation of `scene_batch_edit`.
- `node_snap_to_floor` with `align` tilts all crates to the slopes and lays them on the hill in one call;
  `scene_raycast` checks the result.
- An upright crate on a slope touches it with one edge only and fails the check; so do crates placed by guessing
  heights, or a rock scaled instead of given a collision.
- Evaluation run: `server/test/evals/scenarios/cratesOnTheHill.ts`.
