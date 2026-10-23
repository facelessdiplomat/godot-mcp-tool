# Switch character animations with a state machine

**Request**

> The character has idle and walk animations. Make it play idle while it stands and walk while it moves, with a short
> blend between them.

**Starting point**

A Godot project with the addon enabled and the editor running, and `res://character.tscn`: a `CharacterBody3D` with a
mesh, an `AnimationPlayer` holding the animations `idle` and `walk`, and a script that moves it with `move_and_slide()`.
There is no `AnimationTree` yet.

**Done when**

- The character has an `AnimationTree` that takes its animations from the `AnimationPlayer`, with a state machine:
  Start leads to `idle`, and transitions between `idle` and `walk` blend over about 0.2 s.
- The switch follows the movement: conditions such as `moving` and `stopped` set by the script from the velocity, or
  expressions on the character such as `velocity.length() > 0.1` with `advance_expression_base_node` pointing at it.
- In the running game the tree is in `idle` while the character stands and in `walk` while `game_input` holds a
  movement action: `game_wait` for `get("parameters/playback").get_current_node() == "walk"` on the `AnimationTree`
  succeeds.

**Notes**

- A good run reads the animation names with `animation_get` before it sets up the states, and reads the result of
  `animation_tree_set` for rejected states or a missing transition from Start.
- Automated test: `server/test/integration/animationTree.test.ts`, which sets the condition with
  `game_set_properties` instead of moving the character.
- Evaluation run: `server/test/evals/scenarios/characterStates.ts`.
