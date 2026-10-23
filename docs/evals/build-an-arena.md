# Build an arena

**Request**

> Build a small arena for a 3D prototype in the main scene: a 30 by 30 m floor, walls 3 m high around it, a ramp up to a 2 m high platform in one corner, sunlight with shadows and a sky. Check it from a few angles.

**Starting point**

A Godot project with the addon enabled and the editor running with a window, and an empty `res://main.tscn` (a
`Node3D` root) as the main scene.

**Done when**

- The scene measures about 30 × 30 m with its walls (`node_get_bounds` of the root), and the walls reach about 3 m.
- A platform or the top of a ramp reaches 2 m.
- A `DirectionalLight3D` casts shadows, and the running game has a sky (`Environment.background_mode` is Sky).
- The agent looked at the arena with `game_screenshot` or `editor_screenshot`.

**Notes**

- A good run builds the level in one `scene_batch_edit`, measures it with `node_get_bounds` before taking pictures,
  and looks from several angles.
- A box centered at y = 0 sticks out 0.5 m below and above the floor line; a floor 1 m thick sits at y = −0.5.
- Evaluation run: `server/test/evals/scenarios/buildAnArena.ts`.
