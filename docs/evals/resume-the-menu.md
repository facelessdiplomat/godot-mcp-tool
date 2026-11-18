# Resume the menu

**Request**

> Clicking Resume in the pause menu does nothing. Find out why and fix it.

**Starting point**

The arena with a pause menu on a `CanvasLayer`: Escape pauses the game and shows a Resume button. A full-screen
`ColorRect` named `Shade`, added after the buttons, is drawn over them and takes every mouse click. The editor runs
with a window.

**Done when**

- In the running game Escape still pauses the game and shows the menu.
- A click on the middle of the Resume button continues the game.
- The scripts have no errors.

**Notes**

- `game_get_tree` with `controls: true` lists the visible controls with their rectangles; a click by node path,
  `{"click": "PauseMenu/Buttons/ResumeButton"}`, reproduces the bug without guessing pixels.
- Fixes that work: `mouse_filter` Ignore on the shade, or the shade moved before the buttons.
- Evaluation run: `server/test/evals/scenarios/resumeTheMenu.ts`.
