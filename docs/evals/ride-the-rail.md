# Ride the rail

**Request**

> Make the cart ride around the arena forever at about 3 m/s on a closed rail: a Path3D along the inside of the walls that the cart follows.

**Starting point**

The arena with a walking player and a cart (`Cart`, a `Node3D` with a box mesh) standing in the middle. No rail yet.

**Done when**

- The scripts have no errors.
- A `Path3D` in the arena has a closed curve longer than 20 m, and a `PathFollow3D` below it.
- In the running game the cart stays on the curve and moves along it at 1.5 to 4.5 m/s, measured over one second.

**Notes**

- A good run builds the curve in one `scene_batch_edit`, with its points as `point_count` and `point_N/position`, moves
  the cart under the `PathFollow3D` with `node_reparent`, advances `progress` in a script and checks the speed with
  read steps of `game_input`.
- Evaluation run: `server/test/evals/scenarios/rideTheRail.ts`.
