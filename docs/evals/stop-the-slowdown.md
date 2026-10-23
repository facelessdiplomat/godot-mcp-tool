# Stop the slowdown

**Request**

> The game gets slower the longer it runs. Find out why and fix it.

**Starting point**

The arena with a `Turret` whose script fires a bullet every 0.1 s; the bullets fly on forever and are never freed.

**Done when**

- In the running game the node count stays level: it grows by fewer than 20 between 3 s and 9 s.
- The turret still fires, and the scripts have no errors.
- The agent measured the game with `game_performance`.

**Notes**

- A good run reads the node and object counts with `game_performance` twice, finds the bullets with
  `game_get_tree`, frees them after a lifetime or when they leave the arena, and measures again.
- Evaluation run: `server/test/evals/scenarios/stopTheSlowdown.ts`.
