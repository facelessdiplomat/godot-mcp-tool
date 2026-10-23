# Fix the jump error

**Request**

> When I press jump, the game prints an error and the jump sound never plays. Fix it.

**Starting point**

The arena with a walking player. On a jump its script calls `$JumpSound.play()`, but the player's
`AudioStreamPlayer3D` is named `JumpSFX`.

**Done when**

- In the running game Space still makes the player jump, and jumping prints no error.
- The scripts have no errors.

**Notes**

- A good run reproduces the error with `game_run`, `game_input` and `game_get_output`, reads the node names with
  `scene_get_tree`, fixes the path (or the name) and plays the jump again to confirm.
- Evaluation run: `server/test/evals/scenarios/fixTheJumpError.ts`.
