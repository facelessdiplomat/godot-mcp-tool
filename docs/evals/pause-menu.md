# Pause menu

**Request**

> Add a pause menu: Escape pauses the game and shows Resume and Quit buttons, and Resume continues the game.

**Starting point**

The arena with a walking player and no pause action. The editor runs with a window, so the game has one too and
`game_screenshot` works.

**Done when**

- In the running game Escape pauses the tree and shows buttons whose names contain Resume and Quit.
- Pressing Resume continues the game and hides the menu.
- The scripts have no errors.

**Notes**

- The menu has to keep processing while the tree is paused (`process_mode` Always or When Paused).
- A full-screen shade or menu is placed with `anchors_preset`, such as `"Full Rect"`.
- A good run tries the menu in the running game: `game_input` for Escape, `game_wait` on `get_tree().paused`, and a
  click on the button from a screenshot.
- Evaluation run: `server/test/evals/scenarios/pauseMenu.ts`.
