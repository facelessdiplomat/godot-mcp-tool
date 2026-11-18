# Find the slow function

**Request**

> The game stutters. Tell me which function makes it slow, from a measurement of the running game, and make that function cheaper.

**Starting point**

The arena whose root script calls `plan_routes(5000)`, a loop of square roots, and the cheap `count_coins()` in
every frame.

**Done when**

- In the running game `plan_routes` takes less than 5 ms over 30 frames.
- The agent measured the running game with `game_performance`.

**Notes**

- `game_performance` of a game started from the editor lists the script functions that took the most time of their
  own, with their files and lines; the slow one shows up first.
- Evaluation run: `server/test/evals/scenarios/findTheSlowFunction.ts`.
