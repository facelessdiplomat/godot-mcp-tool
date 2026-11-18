# Land once

**Request**

> The player's landed signal fires again and again after a jump. Make it fire exactly once per landing, and show me the landing frame by frame.

**Starting point**

The arena with a walking, jumping player whose script emits `landed` when it is on the floor after being in the air,
but never forgets that it was in the air, so `landed` fires in every physics frame after the first landing.

**Done when**

- In the running game a jump makes `Player` emit `landed` exactly once.
- The scripts have no errors.
- The agent looked at the landing in the running game.

**Notes**

- `game_input` with `watch_signals: [{"node": "Player", "signal": "landed"}]` counts the emissions of a jump, with
  the step and the physics frame of each.
- `game_screenshot` with `frames` and `every_physics_frames`, or `screenshot` steps in `game_input`, show the landing
  as one labelled image.
- Evaluation run: `server/test/evals/scenarios/landOnce.ts`.
