# Gamepad controls

**Request**

> Let me play with a gamepad too: the left stick moves the player and the A button jumps.

**Starting point**

The arena with a player that moves with the actions `move_forward`, `move_back`, `move_left`, `move_right` and `jump`,
bound to WASD and Space only.

**Done when**

- The four movement actions also have the matching directions of the left stick, and `jump` has the A button.
- The keyboard still works: W moves the player in the running game.

**Notes**

- `input_map_set` replaces the events of an action, so a good run keeps the keys.
- `game_input` cannot press gamepad buttons or move sticks; an action with a `strength` is the closest test.
- Evaluation run: `server/test/evals/scenarios/gamepadControls.ts`.
