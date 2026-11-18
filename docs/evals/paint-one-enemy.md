# Paint one enemy

**Request**

> Make the second enemy red and leave the other enemies as they are.

**Starting point**

The arena with three instances of `res://enemy.tscn`, a `CharacterBody3D` whose `Body` mesh has a gray material
built into the enemy scene: `Enemy1`, `Enemy2` and `Enemy3`.

**Done when**

- In the running game `Enemy2/Body` is drawn red.
- `Enemy1/Body` and `Enemy3/Body` are still gray.
- `res://enemy.tscn` is unchanged, so new enemies stay gray too.

**Notes**

- The change belongs to `Enemy2` only: a material of its own on `Enemy2/Body`, such as
  `{"material_override": {"new": "StandardMaterial3D", "albedo_color": "red"}}`. `node_set_properties` turns on
  Editable Children of `Enemy2`, so that the change is saved with the arena.
- `scene_get_tree` with `expand_instances` shows the nodes inside the enemies.
- Changing the gray material of the enemy scene, or `mesh:material:albedo_color`, would paint every enemy; the tools
  refuse to change a resource of the instanced scene in place and say so.
- Evaluation run: `server/test/evals/scenarios/paintOneEnemy.ts`.
