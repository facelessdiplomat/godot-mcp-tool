# Playtest without a window

**Request**

> Check that the player can jump: pressing Space on the floor makes it jump once and land again.

**Starting point**

A Godot project with the addon installed, no editor running, and a server started with `GODOT_MCP_HEADLESS=1`, as on
a build server without a display. The main scene has a floor and a `Player` (`CharacterBody3D`) whose script jumps
with Space when it is on the floor and counts its jumps in `jumps`.

**Done when**

- The game ran as a process without a window (`game_run` reports the main scene as running), and the agent did not
  start an editor for it.
- `game_wait` saw `is_on_floor()` become true on `Player` before and after the jump, `game_input` held Space, and
  `game_get_properties` read `jumps = 1`.
- The game was stopped at the end.

**Notes**

- A good run checks with numbers and conditions instead of screenshots, which need a window; `godot_status` says
  that the server runs without windows, and `project_info` and `input_map_get` read the project without the editor.
- It reads the jump inside `game_input` with `read` steps, or pauses the game with `game_pause` first, since a later
  call comes after the jump is over; it waits for the landing with a condition instead of a fixed time.
- Automated test: `server/test/integration/windowlessPlaytest.test.ts`.
- Evaluation run: `server/test/evals/scenarios/playtestWithoutAWindow.ts`.
