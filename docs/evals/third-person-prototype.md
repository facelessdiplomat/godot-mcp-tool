# Third-person prototype

**Request**

> Make a third-person prototype in the arena: a player that walks with WASD and jumps on Space, with a camera following from behind. Make sure it works.

**Starting point**

A Godot project with the addon enabled and the editor running, and `res://arena.tscn` as the main scene: a 20 × 20 m
floor with walls, a sun and an overview camera. No player and no input actions.

**Done when**

- The arena has one `CharacterBody3D`, and the scripts have no errors.
- In the running game it stands on the floor, W moves it more than 2 m in a second, Space makes it jump and it lands
  again.
- The current camera stays within 8 m of the player.
- The agent tried the controls in the running game.

**Notes**

- A good run adds the input actions with `input_map_set`, builds the player in one `scene_batch_edit`, checks the
  script with `script_validate`, and confirms walking and jumping with `game_input`, `game_get_properties` and
  `game_wait`.
- Automated test of the same flow: `server/test/integration/milestone2Scenario.test.ts`; evaluation run:
  `server/test/evals/scenarios/thirdPersonPrototype.ts`.
