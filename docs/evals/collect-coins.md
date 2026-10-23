# Collect coins

**Request**

> Put 10 spinning coins around the arena that the player picks up by walking into them, and show on screen how many were collected.

**Starting point**

The arena with a walking player and no coins. The editor runs with a window, so the game has one too and
`game_screenshot` works.

**Done when**

- The running game has 10 coins (`Area3D` nodes) that spin, and a `Label` on the screen.
- A coin disappears when the player walks into it, and the label shows 1.
- The scripts have no errors.

**Notes**

- A good run makes one coin scene and instances it, or adds the coins in one `scene_batch_edit`, puts them in a group,
  and tests a pickup in the running game by moving the player there with `game_input` or `game_set_properties`.
- Evaluation run: `server/test/evals/scenarios/collectCoins.ts`.
