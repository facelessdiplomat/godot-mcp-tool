# Sparks on impact

**Request**

> When the ball hits the wall, it emits hit_wall(point). Make a burst of sparks appear at that point when it happens: a one-shot GPUParticles3D effect that does not run before the hit.

**Starting point**

The arena with a walking player and a ball (`Ball`, a `RigidBody3D` with `ball.gd`) that rolls into the north wall
three seconds after the game starts and then emits `hit_wall(point)`. A `Referee` node counts the physics frames in
which any `GPUParticles3D` emits before the hit. There are no particles yet.

**Done when**

- The scripts have no errors.
- A `GPUParticles3D` in the arena is `one_shot` and has a process material and a mesh to draw.
- In the running game, no particles emit before the hit, they emit right after it, and they emit near the ball.

**Notes**

- A good run adds the particles with their `ParticleProcessMaterial` and draw mesh in one `scene_batch_edit`,
  restarts them from a handler of `hit_wall`, and checks the moment of the hit with `game_pause` and `game_wait` on the
  signal. `emitting` is a poor witness of a burst: with `explosiveness` 1 a restarted one-shot node turns it off on
  its next frame, so the check waits for the `finished` signal instead. A one-shot node that emits in the editor is
  saved with `emitting` off once its burst ends; particles that are not one-shot emit from the start.
- Evaluation run: `server/test/evals/scenarios/sparksOnImpact.ts`.
