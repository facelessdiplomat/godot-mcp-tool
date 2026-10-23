# Camera that follows the player

**Request**

> Make the camera follow the player from behind and above, smoothly, and keep it from going through walls.

**Starting point**

The arena with a walking player and a fixed overview camera.

**Done when**

- In the running game the current camera stays above the walking player, 2.5 to 9 m away, and looks at it.
- With the player backed against a wall, the camera stays inside the arena.
- The scripts have no errors.

**Notes**

- A `SpringArm3D` on the player is the usual way to keep the camera out of walls; smoothing can come from a script
  that lerps a top-level camera toward the arm's end.
- Evaluation run: `server/test/evals/scenarios/cameraFollow.ts`.
