# Evaluation scenarios

Each file here is one realistic task for Claude Code with the godot MCP server, written so that anyone can run it
again and tell whether it passed. Together they check that every capability works in the hands of the agent, not only
in the tests, and they guide the tuning of tool descriptions (§13 of the development plan).

A scenario has four parts:

- **Request** — what the user types, word for word.
- **Starting point** — the project and the files the task begins with.
- **Done when** — results that can be checked with tools or by reading files, never "looks right".
- **Notes** — the tools a good run uses and the mistakes it should avoid.

When running one, record whether it passed, the number of tool calls and the tokens used.

| Scenario | What it exercises |
|---|---|
| [build-an-arena.md](build-an-arena.md) | `scene_batch_edit`, `node_get_bounds`, screenshots from several angles |
| [third-person-prototype.md](third-person-prototype.md) | `input_map_set`, a player and its camera, `game_input`, `game_wait` |
| [dash-with-a-test.md](dash-with-a-test.md) | input actions with a gamepad button, `resource_create`, `test_run` with GUT |
| [health-bar-hud.md](health-bar-hud.md) | UI on a `CanvasLayer` tied to game state |
| [fix-the-jump-error.md](fix-the-jump-error.md) | `game_get_output` with a runtime error, `scene_get_tree` |
| [patrol-between-points.md](patrol-between-points.md) | a movement script, `script_validate`, `game_wait` |
| [collect-coins.md](collect-coins.md) | areas, groups, signals and a counter |
| [pause-menu.md](pause-menu.md) | pausing, `process_mode`, buttons in the running game |
| [camera-follow.md](camera-follow.md) | `SpringArm3D` and camera checks in the running game |
| [stop-the-slowdown.md](stop-the-slowdown.md) | `game_performance` to find a leak |
| [gamepad-controls.md](gamepad-controls.md) | joypad events in `input_map_set` |
| [extract-an-enemy-scene.md](extract-an-enemy-scene.md) | `scene_create`, instancing, `node_delete` in a batch |
| [import-a-character.md](import-a-character.md) | `asset_import_settings_get`, `asset_import_settings_set` |
| [follow-the-player.md](follow-the-player.md) | `navigation_bake` |
| [animate-a-door.md](animate-a-door.md) | `animation_get`, `animation_set`, `animation_delete` |
| [character-states.md](character-states.md) | `animation_tree_get`, `animation_tree_set` |
| [tidy-the-project.md](tidy-the-project.md) | `resource_find_usages`, `filesystem_move`, `filesystem_delete` |
| [export-the-game.md](export-the-game.md) | `export_project` |
| [find-a-bug-with-breakpoints.md](find-a-bug-with-breakpoints.md) | `debug_breakpoints`, `debug_state`, `debug_continue` |
| [playtest-without-a-window.md](playtest-without-a-window.md) | the game tools without the editor, `GODOT_MCP_HEADLESS` |

## Running them

Each scenario is also code in `server/test/evals/scenarios/`: it builds the starting point in a temporary project
with a Godot editor of its own, holds a reference solution, and checks the result through the MCP tools, in the
running game where the request is about behavior. `npm run eval` in `server/` runs them with vitest; these runs never
belong to `npm test` or the integration tests.

- `EVAL_REFERENCE=1 GODOT_BIN=<godot> npm run eval` applies each reference solution instead of an agent and runs the
  checks. It costs nothing and shows that every scenario can be solved and that its checks pass on a correct result.
- `CLAUDE_BIN=<claude> GODOT_BIN=<godot> npm run eval` gives each request to `claude -p` in the project folder, with
  the server of this checkout (`server/dist`, so build first), the plugin's hook and skill, `--restricted` and a
  budget (`EVAL_BUDGET_USD`, 5 by default), then runs the checks. `EVAL_SCENARIOS=a,b` picks scenarios and
  `EVAL_MODEL` the model. Every run is a real session on your account.
- `--restricted` keeps the file tools in the project folder, so the run adds the skill folder of the plugin with
  `--add-dir` for the pages that the skill links to.
- The unsafe tools, such as `filesystem_delete`, make Claude Code ask the user, and only a person can answer:
  `--permission-prompt-tool` may not confirm them. Scenarios that allow them start the server through
  `server/test/evals/serverWithoutConfirmations.ts`, which passes everything through but takes that mark off the
  list of tools, as if the user confirmed every call.
- A run writes `result.json` (the checks, the tool calls by name, turns, tokens, cost and duration) and the agent's
  stream to `server/test/evals/results/<time>-<scenario>/`, which Git ignores.
- `build-an-arena`, `health-bar-hud`, `collect-coins` and `pause-menu` open an editor window: they ask for pictures
  or for something on the screen, and a game started from an editor with a window has one too, so `game_screenshot`
  works.
- A scenario that an agent solved another valid way gets that way as another reference solution, so a check that
  rejects it fails in the reference run.

## Results

### First full run, 2026-10-23

Claude Opus 5.5 in Claude Code 2.1.308, Godot 4.8-beta (a custom build without export templates), one run per
scenario. Cost is the list price that Claude Code reports; time is the agent's own.

| Scenario | Checks | Tool calls | Cost, $ | Time, s |
|---|---|---|---|---|
| build-an-arena | 6/6 | 16 | 0.36 | 62 |
| third-person-prototype | 8/8 | 77 | 1.27 | 212 |
| dash-with-a-test | 6/6 | 23 | 0.40 | 62 |
| health-bar-hud | 3/3 | 23 | 0.35 | 45 |
| fix-the-jump-error | 3/3 | 48 | 0.66 | 151 |
| patrol-between-points | 6/6 | 28 | 0.38 | 79 |
| collect-coins | 6/6 | 27 | 0.42 | 53 |
| pause-menu | 4/4 | 30 | 0.50 | 82 |
| camera-follow | 4/4 | 26 | 0.40 | 65 |
| stop-the-slowdown | 4/4 | 18 | 0.26 | 66 |
| gamepad-controls | 6/6 | 66 | 0.90 | 182 |
| extract-an-enemy-scene | 6/6 | 23 | 0.34 | 37 |
| import-a-character | 2/3 | 11 | 0.23 | 56 |
| follow-the-player | 5/5 | 48 | 0.64 | 165 |
| animate-a-door | 3/3 | 14 | 0.25 | 38 |
| character-states | 6/6 | 23 | 0.37 | 69 |
| tidy-the-project | 7/9 | 13 | 0.20 | 36 |
| export-the-game | 3/4 | 7 | 0.14 | 21 |
| find-a-bug-with-breakpoints | 5/5 | 24 | 0.29 | 49 |
| playtest-without-a-window | 5/6 | 46 | 0.69 | 172 |
| **16 of 20 passed** | | **591** | **9.06** | **1704** |

- `import-a-character` and `export-the-game` failed on wrong checks. The agent built a `CharacterBody3D` scene with a
  capsule that fits the model, which the check did not accept, and the export check asked for the unsaved change in a
  build that the missing templates ruled out. Both checks are fixed. A later run of `export-the-game` showed a third
  wrong check: it took "I exported with the preset, which writes to `build/macos/game.zip`" for the claim of a
  build, so it now looks for the agent saying that it could not make the build.
- `tidy-the-project` could not delete the unused material: `filesystem_delete` asks the user, and nobody could answer
  in `claude -p`. Scenarios that allow the unsafe tools now count their calls as confirmed.
- In `playtest-without-a-window` the agent could not see the player in the air and started an editor to use
  breakpoints.
- The four runs that had to see a jump, `third-person-prototype`, `gamepad-controls`, `fix-the-jump-error` and
  `playtest-without-a-window`, took 237 of the 591 calls and $3.52 of the $9.06. Claude Code ran a `game_wait` and a
  `game_input` sent in one message one after another, so the wait was over before the jump began; a read in a later
  message came seconds after a jump of 0.9 s; and input sent while `game_pause` held the game was lost.

### The jump scenarios again, 2026-10-23

The same model and versions, after `game_input` got `read` steps and `game_pause` began to hold the game between the
holds and waits of `game_input`, `game_wait` and `game_step`:

| Scenario | Checks | Tool calls | Cost, $ | Time, s |
|---|---|---|---|---|
| third-person-prototype | 8/8 | 77 → 29 | 1.27 → 0.51 | 212 → 76 |
| fix-the-jump-error | 3/3 | 48 → 15 | 0.66 → 0.24 | 151 → 41 |
| gamepad-controls | 6/6 | 66 → 15 | 0.90 → 0.28 | 182 → 49 |
| playtest-without-a-window | 6/6, was 5/6 | 46 → 15 | 0.69 → 0.26 | 172 → 30 |
| **Together** | | **237 → 74** | **3.52 → 1.30** | **717 → 196** |

Each agent checked the jump in one or two `game_input` calls with `read` steps; in `playtest-without-a-window` it
paused the game first and did not start an editor.

### The small fixes, 2026-10-23

After the plugin began to check scripts written with `Write`, the project tools began to read the project without
the editor, `scene_batch_edit` began to keep values that the engine adjusts, `anchors_preset` became settable and the
scene tools began to take `"main"`:

| Scenario | Checks | Failed tool calls | Tool calls | Cost, $ | Time, s |
|---|---|---|---|---|---|
| health-bar-hud | 3/3 | 1 → 0 | 23 → 23 | 0.35 → 0.60 | 45 → 44 |
| pause-menu | 4/4 | 1 → 0 | 30 → 26 | 0.50 → 0.41 | 82 → 47 |
| stop-the-slowdown | 4/4 | 1 → 0 | 18 → 19 | 0.26 → 0.27 | 66 → 40 |
| playtest-without-a-window | 6/6 | 3 → 1 | 46 → 15 | 0.69 → 0.26 | 172 → 35 |

The numbers before the arrows are from the first full run.

- In `pause-menu` the agent placed the shade and the centered buttons with `anchors_preset`, which the first run
  could not set.
- In `playtest-without-a-window` `project_info` and `input_map_get` answered without the editor; the one failed call
  was `scene_get_tree`, which still needs the editor.
- The agents of `health-bar-hud` and `stop-the-slowdown` did not need the batch or the `"main"` fixes this time.
- In each run the plugin checked the scripts that the agent wrote with `Write`, which it never did in the first run.

### Gamepad input and the tools loaded up front, 2026-10-23

After `game_input` got `joypad_button` and `joypad_motion` steps and the tools that most sessions use began to load
up front, `gamepad-controls` passed all 8 checks, including the two new ones in the running game (the left stick moves
the player, the A button makes it jump), with 9 tool calls (66 in the first run), one tool search, $0.43 and 41 s.
The agent tried the stick in one `game_input` with `read` steps.

### Second full run, 2026-10-23

The same model and versions after all the fixes above, one run per scenario; the numbers before the arrows are from
the first full run. Checks are those of the second run: `gamepad-controls` has two more.

| Scenario | Checks | Tool calls | Cost, $ | Time, s |
|---|---|---|---|---|
| build-an-arena | 6/6 | 16 → 15 | 0.36 → 0.33 | 62 → 54 |
| third-person-prototype | 8/8 | 77 → 31 | 1.27 → 0.50 | 212 → 116 |
| dash-with-a-test | 6/6 | 23 → 25 | 0.40 → 0.43 | 62 → 95 |
| health-bar-hud | 3/3 | 23 → 24 | 0.35 → 0.34 | 45 → 44 |
| fix-the-jump-error | 3/3 | 48 → 19 | 0.66 → 0.22 | 151 → 40 |
| patrol-between-points | 6/6 | 28 → 19 | 0.38 → 0.25 | 79 → 41 |
| collect-coins | 6/6 | 27 → 24 | 0.42 → 0.35 | 53 → 50 |
| pause-menu | 4/4 | 30 → 20 | 0.50 → 0.33 | 82 → 43 |
| camera-follow | 4/4 | 26 → 20 | 0.40 → 0.28 | 65 → 48 |
| stop-the-slowdown | 4/4 | 18 → 26 | 0.26 → 0.29 | 66 → 62 |
| gamepad-controls | 8/8 | 66 → 10 | 0.90 → 0.21 | 182 → 26 |
| extract-an-enemy-scene | 6/6 | 23 → 26 | 0.34 → 0.35 | 37 → 35 |
| import-a-character | 3/3 | 11 → 11 | 0.23 → 0.21 | 56 → 23 |
| follow-the-player | 5/5 | 48 → 29 | 0.64 → 0.47 | 165 → 102 |
| animate-a-door | 3/3 | 14 → 15 | 0.25 → 0.23 | 38 → 31 |
| character-states | 6/6 | 23 → 23 | 0.37 → 0.34 | 69 → 43 |
| tidy-the-project | 9/9 | 13 → 14 | 0.20 → 0.20 | 36 → 24 |
| export-the-game | 3/3 | 7 → 3 | 0.14 → 0.10 | 21 → 17 |
| find-a-bug-with-breakpoints | 3/5 | 24 → 23 | 0.29 → 0.29 | 49 → 51 |
| playtest-without-a-window | 6/6 | 46 → 12 | 0.69 → 0.18 | 172 → 23 |
| **19 of 20 passed** | | **591 → 389** | **9.06 → 5.90** | **1704 → 968** |

- 19 of 20 passed, with 389 tool calls instead of 591, 7 failed calls instead of 17 and 20 tool searches instead of
  44, for $5.90 instead of $9.06 and 16 minutes of the agent instead of 28.
- `find-a-bug-with-breakpoints` failed: the agent stopped the game before removing its breakpoint, and the breakpoint
  stayed, because the debug adapter of Godot forgets its breakpoints when a game ends. The server now sends the
  current breakpoints of a script before removing any.
- Three calls gave node references relative to the scene root (`"Player"` for `"../Player"`), and one nested the
  properties of a new resource under `"properties"`; each agent corrected itself on the next call.

### The last small fixes, 2026-10-23

After node references began to resolve from the scene root, new resources began to take their properties nested
under `"properties"`, and the scene tools began to read scenes without the editor, the four scenarios with failed
calls in the second run passed without any: `health-bar-hud` (3 failed calls before), `patrol-between-points` (1),
`camera-follow` (1) and `playtest-without-a-window` (1), for $1.17 together. In `camera-follow` the agent again set
`"target": "Player"`, which now works, and in `playtest-without-a-window` it read the main scene without the editor.
