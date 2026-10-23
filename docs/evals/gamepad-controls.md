# Gamepad controls

**Request**

> Let me play with a gamepad too: the left stick moves the player and the A button jumps.

**Starting point**

The arena with a player that moves with the actions `move_forward`, `move_back`, `move_left`, `move_right` and `jump`,
bound to WASD and Space only.

**Done when**

- The four movement actions also have the matching directions of the left stick, and `jump` has the A button.
- In the running game the keyboard still works (W moves the player), the left stick moves the player too, and the A
  button makes it jump.

**Notes**

- `input_map_set` replaces the events of an action, so a good run keeps the keys.
- A good run tries the gamepad in the running game: `game_input` presses buttons with `joypad_button` steps and
  tilts sticks with `joypad_motion` steps.
- Evaluation run: `server/test/evals/scenarios/gamepadControls.ts`.
