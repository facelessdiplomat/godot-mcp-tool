# Footsteps and blend

**Request**

> Call _on_footstep twice in every walk cycle, and blend walking and running by the player's speed.

**Starting point**

The arena with a walking, jumping player whose script counts footsteps in `_on_footstep()`. The player has an
`AnimationPlayer` with a one-second `walk` and a half-second `run`, both bobbing the body, and an empty
`AnimationTree`.

**Done when**

- The `walk` animation calls `_on_footstep` twice per cycle.
- The `AnimationTree` blends animations by a parameter, as a blend state of a state machine or as a blend space.
- In the running game the blend position grows when the player moves.
- The scripts have no errors.

**Notes**

- `animation_set` with a method track (`{"type": "method", "path": ".", "keys": [...]}`) keeps the existing value
  track only when it is given again, because it replaces the whole animation.
- `animation_tree_set` with `{"name": "move", "blend": [{"animation": "walk", "at": 0}, {"animation": "run",
  "at": 5}]}` builds the blend; its result names `parameters/move/blend_position`, which the player script sets from
  its speed.
- Evaluation run: `server/test/evals/scenarios/footstepsAndBlend.ts`.
