# HUD at two sizes

**Request**

> Show me the HUD at 16:9 and at 4:3, and make sure the health bar stays on screen at both.

**Starting point**

`res://hud.tscn` is a full-window `Control` with a `ProgressBar` named `Health` placed 780 pixels from the top. The
project stretches its UI (`canvas_items`, aspect `expand`) from a 1152×648 base, so the layout is 648 pixels high at
16:9 and 864 pixels high at 4:3: the bar shows at 4:3 but falls below the window at 16:9.

**Done when**

- The health bar lies inside the window of the project.
- The bar is anchored to the bottom edge, so it stays on screen whatever the height of the window.
- The agent showed the HUD at both sizes.

**Notes**

- `editor_screenshot` with `sizes: [[1920, 1080], [1440, 1080]]` renders the HUD as the game window shows it at both
  aspects in one image; `node_get_bounds` says whether a control fits the window.
- Needs the editor with a window.
- Evaluation run: `server/test/evals/scenarios/hudAtTwoSizes.ts`.
