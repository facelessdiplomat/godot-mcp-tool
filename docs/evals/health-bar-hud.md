# Health bar on the screen

**Request**

> Add a health bar to the screen that shows the player's health and goes down when the player takes damage.

**Starting point**

The arena with a walking player whose script has `var health := 100` and `take_damage(amount)`. The player starts on
`Spikes`, an `Area3D` that calls `take_damage(10)` once a second on the bodies standing on it. The editor runs with a
window, so the game has one too and `game_screenshot` works.

**Done when**

- In the running game a `Range` control on the screen, such as a `ProgressBar`, shows the player's health as it drops
  below 100 on the spikes.
- The scripts have no errors.

**Notes**

- A good run puts the bar on a `CanvasLayer`, ties it to the health through a signal or by reading it, and checks it
  in the running game with `game_wait` or a screenshot.
- A `ProgressBar` cannot be lower than its font needs (27 px with the default theme).
- Evaluation run: `server/test/evals/scenarios/healthBarHud.ts`.
