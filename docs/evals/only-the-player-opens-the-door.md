# Only the player opens the door

**Request**

> The door at the north wall of the arena has an open() function. Make it open when the player walks up to it, but never for the enemy. Use the physics layers that the project already names.

**Starting point**

The arena with a walking player, an enemy (a `CharacterBody3D` without a script) and a door (`Door`, a `Node3D` with
`door.gd`, whose `open()` slides its panel up and sets `is_open`). The project names its 3D physics layers: 1 "world",
2 "player", 3 "enemies"; the player is on "player" and the enemy on "enemies", and both collide with "world". Nothing
calls `open()` yet.

**Done when**

- The scripts have no errors.
- An `Area3D` in the arena detects the layer "player" and not the layer "enemies".
- In the running game, the enemy standing in front of the door leaves it closed, and the player standing there opens
  it (`is_open` becomes true).

**Notes**

- A good run reads the named layers in `project_info`, adds the area with its shape in one `scene_batch_edit` and sets
  `collision_mask` by name, such as `["player"]`, then checks both bodies in the running game with
  `game_set_properties` and `game_wait`.
- Evaluation run: `server/test/evals/scenarios/onlyThePlayerOpensTheDoor.ts`.
