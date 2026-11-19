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
| [paint-one-enemy.md](paint-one-enemy.md) | changes inside an instanced scene, `expand_instances` |
| [land-once.md](land-once.md) | `watch_signals` in `game_input`, frame strips |
| [resume-the-menu.md](resume-the-menu.md) | `controls` in `game_get_tree`, clicks on a Control by its path |
| [crates-on-the-hill.md](crates-on-the-hill.md) | `node_add_collision`, `node_snap_to_floor`, `scene_raycast` |
| [footsteps-and-blend.md](footsteps-and-blend.md) | method tracks in `animation_set`, blend states in `animation_tree_set` |
| [hud-at-two-sizes.md](hud-at-two-sizes.md) | UI scenes in `editor_screenshot` at several sizes, `node_get_bounds` of controls |
| [rename-everywhere.md](rename-everywhere.md) | `script_rename_symbol` across scripts, signal connections and method tracks |
| [find-the-slow-function.md](find-the-slow-function.md) | function times in `game_performance` |
| [fix-the-water-shader.md](fix-the-water-shader.md) | shaders in `script_validate`, one error at a time |
| [bring-back-the-pillars.md](bring-back-the-pillars.md) | `editor_undo` across an action that must stay |
| [turn-on-a-plugin.md](turn-on-a-plugin.md) | `plugin_set_enabled` and a plugin that adds an autoload |
| [exports-for-windows-and-linux.md](exports-for-windows-and-linux.md) | `export_preset_add`, packs with `export_project` |
| [keep-the-best-score.md](keep-the-best-score.md) | saving to `user://` and loading it in the next run |
| [music-on-its-own-bus.md](music-on-its-own-bus.md) | the audio bus layout of the project and the bus of each player |
| [translate-the-menu.md](translate-the-menu.md) | a CSV translation and `game_run` with `locale` |
| [pave-the-courtyard.md](pave-the-courtyard.md) | the cells of a `GridMap` in the saved scene |
| [a-level-of-tiles.md](a-level-of-tiles.md) | a 2D level: a `TileSet`, the cells of a `TileMapLayer`, a `Camera2D` |
| [only-the-player-opens-the-door.md](only-the-player-opens-the-door.md) | physics layers by name in `project_info`, masks and the running game |
| [sparks-on-impact.md](sparks-on-impact.md) | a one-shot `GPUParticles3D` started by a signal, checked at the frame of the hit |
| [skin-the-menu.md](skin-the-menu.md) | a `Theme` built item by item with `resource_create`, checked on buttons in the running game |
| [ride-the-rail.md](ride-the-rail.md) | a closed `Curve3D` by its points, `PathFollow3D`, a speed measured with read steps |
| [swing-the-gate.md](swing-the-gate.md) | a `HingeJoint3D` and its axis, a player that pushes rigid bodies |
| [sword-in-hand.md](sword-in-hand.md) | a `BoneAttachment3D` on a bone of a `Skeleton3D`, followed through an animation |
| [blocks-from-a-scene.md](blocks-from-a-scene.md) | a `MeshLibrary` made from a scene of blocks, with collision, for a `GridMap` |
| [reach-the-island.md](reach-the-island.md) | `navigation_get_path` on a level whose regions do not connect |
| [silence-in-the-arena.md](silence-in-the-arena.md) | `audio_buses_get` with `in_game`: a muted bus and a player that never starts |
| [why-is-it-dark.md](why-is-it-dark.md) | `render` modes of views: a room without light and a black material |
| [same-look-after-the-refactor.md](same-look-after-the-refactor.md) | `compare_to` of `editor_screenshot` after turning nodes into instances |
| [one-more-argument.md](one-more-argument.md) | `script_find_references` before a function gets a second argument: typed and untyped calls, a bound signal value, a method track |
| [the-crate-by-the-ramp.md](the-crate-by-the-ramp.md) | a node named by where it stands: `markers` of a view, or the bounds in numbers |

## Running them

Each scenario is also code in `server/test/evals/scenarios/`: it builds the starting point in a temporary project
with a Godot editor of its own, holds a reference solution, and checks the result through the MCP tools, in the
running game where the request is about behavior. `npm run eval` in `server/` runs them with vitest; these runs never
belong to `npm test` or the integration tests.

- `EVAL_REFERENCE=1 GODOT_BIN=<godot> npm run eval` applies each reference solution instead of an agent and runs the
  checks. It costs nothing and shows that every scenario can be solved and that its checks pass on a correct result.
- `EVAL_UNSOLVED=1 GODOT_BIN=<godot> npm run eval` runs the checks on the starting point with nothing done and
  expects a failed check, so a scenario cannot pass without the work it asks for.
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

### Third full run, 2026-11-18

Claude Opus 5.5 in Claude Code 2.1.318, the same Godot build (`4.8.beta.custom_build.679066724`, without export
templates), the server and addon of commit `6baf9bc`, one run per scenario: the twenty scenarios of the first runs and
the twelve of milestones 6–9. For the first twenty, the numbers before the arrows are from the second full run.

| Scenario | Checks | Tool calls | Cost, $ | Time, s |
|---|---|---|---|---|
| build-an-arena | 6/6 | 15 → 17 | 0.33 → 0.68 | 54 → 54 |
| third-person-prototype | 8/8 | 31 → 20 | 0.50 → 0.39 | 116 → 65 |
| dash-with-a-test | 6/6 | 25 → 23 | 0.43 → 0.40 | 95 → 64 |
| health-bar-hud | 3/3 | 24 → 23 | 0.34 → 0.33 | 44 → 40 |
| fix-the-jump-error | 3/3 | 19 → 16 | 0.22 → 0.21 | 40 → 30 |
| patrol-between-points | 6/6 | 19 → 18 | 0.25 → 0.26 | 41 → 37 |
| collect-coins | 6/6 | 24 → 22 | 0.35 → 0.35 | 50 → 50 |
| pause-menu | 4/4 | 20 → 22 | 0.33 → 0.35 | 43 → 42 |
| camera-follow | 4/4 | 20 → 19 | 0.28 → 0.29 | 48 → 50 |
| stop-the-slowdown | 4/4 | 26 → 20 | 0.29 → 0.30 | 62 → 56 |
| gamepad-controls | 8/8 | 10 → 16 | 0.21 → 0.26 | 26 → 38 |
| extract-an-enemy-scene | 6/6 | 26 → 30 | 0.35 → 0.31 | 35 → 39 |
| import-a-character | 3/3 | 11 → 7 | 0.21 → 0.21 | 23 → 24 |
| follow-the-player | 5/5 | 29 → 42 | 0.47 → 0.61 | 102 → 101 |
| animate-a-door | 3/3 | 15 → 14 | 0.23 → 0.23 | 31 → 23 |
| character-states | 6/6 | 23 → 18 | 0.34 → 0.32 | 43 → 37 |
| tidy-the-project | 9/9 | 14 → 17 | 0.20 → 0.24 | 24 → 26 |
| export-the-game | 3/3 | 3 → 6 | 0.10 → 0.16 | 17 → 19 |
| find-a-bug-with-breakpoints | 5/5, was 3/5 | 23 → 22 | 0.29 → 0.32 | 51 → 44 |
| playtest-without-a-window | 6/6 | 12 → 11 | 0.18 → 0.18 | 23 → 22 |
| paint-one-enemy | 4/4 | 17 | 0.28 | 30 |
| land-once | 3/3 | 15 | 0.29 | 44 |
| resume-the-menu | 3/3 | 12 | 0.18 | 24 |
| crates-on-the-hill | 2/3 | 27 | 0.43 | 65 |
| footsteps-and-blend | 5/5 | 20 | 0.36 | 49 |
| hud-at-two-sizes | 3/3 | 26 | 0.46 | 55 |
| rename-everywhere | 6/6 | 6 | 0.13 | 16 |
| find-the-slow-function | 2/2 | 11 | 0.19 | 30 |
| fix-the-water-shader | 5/5 | 13 | 0.20 | 28 |
| bring-back-the-pillars | 4/4 | 12 | 0.20 | 23 |
| turn-on-a-plugin | 4/4 | 3 | 0.09 | 8 |
| exports-for-windows-and-linux | 5/5 | 8 | 0.16 | 27 |
| **31 of 32 passed** | | **553** | **9.38** | **1261** |

- The first twenty all passed, with 383 tool calls instead of 389, 3 failed calls instead of 7 and 16 tool searches
  instead of 20, for $6.40 instead of $5.90 and 14 minutes of the agent instead of 16. Most of the extra cost is
  `build-an-arena`, whose agent took three screenshots, and `follow-the-player`, which ran the game three times.
- The twelve new ones passed 11 of 12, with 170 tool calls, 7 of them failed, and 12 tool searches, for $2.97 and
  7 minutes of the agent.
- `crates-on-the-hill` failed on its own check. The agent tilted every crate by 36.87° so that it lies flat on its
  slope, saw that `node_snap_to_floor` left the tilted crates 3–4 cm above the slope, and computed their heights
  itself: all four bottom corners of every crate touch the slope. The check compares the bottom of a crate's bounding
  box with the ground under its center, which holds only for an upright crate, so it found every tilted crate 3.75 cm
  too low. `node_snap_to_floor` follows the same rule: it casts one ray from the bottom center of the bounding box.
- Four calls of `game_screenshot` came in scenarios whose editor runs without a window (`follow-the-player`,
  `paint-one-enemy`, `crates-on-the-hill` and `fix-the-water-shader`): neither `godot_status` nor `game_run` says
  that the game has no window.
- `exports-for-windows-and-linux` sent its two exports in one message before reading that a build without templates
  can still export packs, then exported packs; `export-the-game` met the missing templates once, as the task expects.
  `hud-at-two-sizes` tried to set the size of the root window in the running game, which the engine keeps, and then
  used `content_scale_size`. The other two failed calls were the agent's: a tool name without its server prefix, and
  an `Edit` whose text appeared twice in the script.

After this run `node_snap_to_floor` began to stop where the first point of a node's own shapes touches the ground and
got `align`, which first tilts each node to the surface; the check of `crates-on-the-hill` began to measure the four
corners of each crate's bottom in the running game; `godot_status` and `game_run` began to say when the game has no
window; and `game_set_properties` began to point to `window_size` of `game_run` when the game window keeps its size.
The reference solution of `crates-on-the-hill` passes the new check, and by the positions and rotations that the agent
of this run set, its crates meet it too.

### The affected scenarios again, 2026-11-18

The same model and versions after the fixes above, for the five scenarios that they touch; the numbers before the
arrows are from the third full run.

| Scenario | Checks | Failed tool calls | Tool calls | Cost, $ | Time, s |
|---|---|---|---|---|---|
| crates-on-the-hill | 3/3, was 2/3 | 1 → 0 | 27 → 23 | 0.43 → 0.34 | 65 → 46 |
| follow-the-player | 5/5 | 1 → 0 | 42 → 35 | 0.61 → 0.51 | 101 → 81 |
| paint-one-enemy | 4/4 | 2 → 0 | 17 → 9 | 0.28 → 0.19 | 30 → 18 |
| fix-the-water-shader | 5/5 | 1 → 0 | 13 → 7 | 0.20 → 0.14 | 28 → 20 |
| hud-at-two-sizes | 3/3 | 1 → 1 | 26 → 27 | 0.46 → 0.43 | 55 → 54 |
| **Together** | | **6 → 1** | **125 → 101** | **1.98 → 1.60** | **279 → 219** |

- `crates-on-the-hill` passed all three checks: the agent laid the ten crates with one call of `node_snap_to_floor`
  with `align`, which tilted each crate to its slope.
- After `godot_status` and `game_run` said that the game had no window, no agent of the four windowless scenarios
  tried a screenshot.
- In `hud-at-two-sizes` the agent ran the game with `window_size` [1280, 720] and then [1024, 768], but both games
  came up at 1152×648, the size of the project, from an editor with a window on macOS. `game_set_properties` on the
  size of `/root` was refused, its new hint pointed back to `window_size`, and the agent changed
  `content_scale_size` instead. No test checked that `window_size` reaches the game, only the arguments that it adds.

After this rerun `window_size` began to reach the game: the Game view of an editor with a window had replaced
`--resolution` with its own size, and a game without a window had taken the size of the project. A test now reads the
size of `/root` in the running game, with and without a window.

With that fix `hud-at-two-sizes` passed again with 21 tool calls and none failed, instead of 27 and 1, for $0.30 in
32 s instead of $0.43 in 54 s. The agent ran the game with `window_size` [1024, 768], `game_run` reported no other
size, and the game laid the HUD out in a viewport of 1152×864, as the stretch settings of the project scale that
window; it no longer touched the size of `/root` or `content_scale_size`.

### Five scenarios for the backlog, 2026-11-18

The same model and versions, five new scenarios for areas that the earlier ones leave out, one run each, with the tools
that a user has by default, so without the unsafe ones.

| Scenario | Checks | Tool calls | Failed tool calls | Cost, $ | Time, s |
|---|---|---|---|---|---|
| keep-the-best-score | 3/3 | 29 | 3 | 0.35 | 60 |
| music-on-its-own-bus | 4/4 | 38 | 0 | 0.60 | 85 |
| translate-the-menu | 3/3 | 17 | 0 | 0.24 | 30 |
| pave-the-courtyard | 4/4 | 21 | 3 | 0.43 | 57 |
| a-level-of-tiles | 4/5 | 42 | 2 | 0.77 | 96 |
| **4 of 5 passed** | | **147** | **8** | **2.39** | **328** |

- `a-level-of-tiles` failed on its own check: the agent stopped its camera at the edges of the level, and a walk of one
  second from the left edge did not move it. The check now walks for 3 seconds and measures how far the camera moves;
  a second run passed all 5 checks with 38 tool calls, 1 of them failed, for $0.73 in 82 s.
- Only `translate-the-menu` needed nothing beyond the tools: a CSV, `editor_rescan` and `project_settings_set`.
- In `keep-the-best-score` `game_set_properties` twice refused to set `best`, a script variable without `@export`,
  since it takes only the properties that the inspector shows, so the agent wrote a test script; Claude Code kept it
  from reading `save.json` in the folder of the user data, which no tool reads.
- In `music-on-its-own-bus` no tool edits the audio bus layout: `resource_create` refuses `bus/<n>/…`, and the editor
  drops a bus name that its own layout lacks, so no player can be put on a new bus. The agent wrote
  `default_bus_layout.tres` and edited `arena.tscn` as text, which the instructions of the server forbid while the
  editor is connected.
- In `pave-the-courtyard` `node_set_properties` twice refused the `data` of the `GridMap`; the agent then wrote a
  `@tool` script with a setter that paints the cells in the editor.
- In `a-level-of-tiles` no tool adds tiles or collision polygons to a `TileSet` (`resource_set_properties` refused
  `physics_layers`) or paints the cells of a `TileMapLayer`. Both runs wrote a one-off editor script that built them
  and asked the user to delete it afterwards, since deleting files is an unsafe tool, and both asked `resource_get` for
  the size of `res://tiles.png`, which it does not read.

### The four scenarios again with their tools, 2026-11-18

The tools that those runs asked for came next: `audio_buses_get` and `audio_buses_set`, `gridmap_get_cells` and
`gridmap_set_cells`, `tileset_add_atlas`, `tilemap_get_cells` and `tilemap_set_cells`, `user_data_get`,
`resource_get` reading textures, and `game_set_properties` setting script variables without `@export`. The reference
solutions of the four scenarios that needed them now use them instead of writing text, and each scenario ran once more
with an agent:

| Scenario | Checks | Tool calls | Failed tool calls | Cost, $ | Time, s |
|---|---|---|---|---|---|
| keep-the-best-score | 3/3 | 16 | 0 | 0.25 | 33 |
| music-on-its-own-bus | 4/4 | 12 | 0 | 0.21 | 20 |
| pave-the-courtyard | 4/4 | 6 | 0 | 0.15 | 13 |
| a-level-of-tiles | 5/5 | 19 | 0 | 0.32 | 32 |
| **4 of 4 passed** | | **53** | **0** | **0.93** | **98** |

- The first runs of the same four took 130 tool calls with 8 failed, $2.15 and 298 s.
- No run wrote a scene or a resource as text, and none wrote an editor script: the agents added the buses with
  `audio_buses_set` and put the players on them with `scene_batch_edit`, paved the courtyard with two boxes of
  `gridmap_set_cells`, and built the level with `tileset_add_atlas`, collision included, and one `tilemap_set_cells`.
- In `keep-the-best-score` `game_set_properties` set `best` at once, its setter saved the score, and `user_data_get`
  showed `save.json`.

### Six scenarios for areas that none covered, 2026-11-19

Task T7 of the [plan for the next version](../NEXT_VERSION_PLAN.md) added six scenarios for areas that no scenario
touched: particles, themes, joints, paths, skeletons and a `MeshLibrary` made from a scene. Each passes with its
reference solution and fails when nothing is done (`EVAL_REFERENCE=1` and `EVAL_UNSOLVED=1`, Godot 4.8 at the pinned
commit). The runs with an agent are still to come.

| Scenario | Reference run | Unsolved run |
|---|---|---|
| sparks-on-impact | 7/7 | fails |
| skin-the-menu | 8/8 | fails |
| ride-the-rail | 6/6 | fails |
| swing-the-gate | 5/5 | fails |
| sword-in-hand | 4/4 | fails |
| blocks-from-a-scene | 6/6 | fails |

Writing the reference solutions found four gaps before any agent did:

- The items of a `Theme`, the points of a curve and the items of a `MeshLibrary` could not be set by name: these
  objects list such properties only once they exist, so `resource_create` and the node tools rejected
  `"Button/styles/normal"`, `"point_0/position"` and `"item/0/mesh"`. The codec now takes them, with their types
  from the kind of theme item or from a fresh object that has one point or one item, and sets the count of points
  before the points (`codec/dynamic_properties.gd`).
- A `NodePath` property, such as `node_a` of a joint, took `"Post"` as a child of the joint, while the description of
  `properties` promised paths from the scene root too. The hinge then joined nothing and the gate fell. Such a path
  is now made relative to the node when it leads nowhere from the node but somewhere from the scene root.
- A `MeshLibrary` made from a scene, which the editor does with Scene → Export As → MeshLibrary, still needs the
  meshes and shapes of the scene: the reference solution of `blocks-from-a-scene` writes the library as a new file. The
  agent run decides whether T14 needs a tool.
- Three pieces of engine knowledge went to the 3D page of the skill: a `CharacterBody3D` does not push rigid bodies,
  a `HingeJoint3D` turns around its own Z axis, and a burst of one-shot particles is checked by its `finished` signal.

### A second argument for a function, 2026-11-19

Task T15 added `script_find_references` and the scenario `one-more-argument`, which passes with its reference
solution (6/6) and fails when nothing is done (Godot 4.8 at the pinned commit). Writing its reference solution found a
gap: a windowless editor kept `enemy.gd` as it was after the file changed on disk, because no tab of the script editor
showed it, so `signal_connect` refused the second bound value of the poison timer. `editor_rescan` now reloads such
scripts and names them. The run with an agent is still to come.

### Markers on views, 2026-11-19

Task T12 added `markers` to the views of `editor_screenshot` and `game_screenshot` and the scenario
`the-crate-by-the-ramp`, which passes with its reference solution (8/8) and fails when nothing is done (Godot 4.8 at
the pinned commit). Markers are a hypothesis: the run with an agent decides whether the option stays.

### The scenarios of 0.3.0 with an agent, 2026-11-19

Claude Opus 5.5 in Claude Code 2.1.318, the same Godot build, the server and addon of commit `c1889ab`, one run per
scenario, three runs at a time; the three scenarios with a window ran one after another. The thirteen runs cost
$5.46 together.

| Scenario | Checks | Tool calls | Cost, $ | Time, s |
|---|---|---|---|---|
| only-the-player-opens-the-door | 4/4 | 24 | 0.67 | 53 |
| sparks-on-impact | 7/7 | 17 | 0.30 | 45 |
| skin-the-menu | 8/8 | 14 | 0.32 | 30 |
| ride-the-rail | 6/6 | 19 | 0.41 | 57 |
| swing-the-gate | 5/5 | 20 | 0.42 | 71 |
| sword-in-hand | 4/4 | 12 | 0.53 | 30 |
| blocks-from-a-scene | 6/6 | 33 | 0.62 | 83 |
| reach-the-island | 3/3 | 21 | 0.34 | 43 |
| silence-in-the-arena | 3/3 | 12 | 0.21 | 20 |
| why-is-it-dark | 3/3 | 16 | 0.59 | 36 |
| same-look-after-the-refactor | 3/3 | 21 | 0.57 | 56 |
| one-more-argument | 6/7 | 21 | 0.32 | 41 |
| the-crate-by-the-ramp | 8/8 | 5 | 0.16 | 19 |

- The tools of phase 3 were used where they answer the question: `navigation_get_path` in `reach-the-island`, once to
  find the gap and twice to check the fix; `audio_buses_get` with `in_game` in `silence-in-the-arena`; `compare_to`
  in `same-look-after-the-refactor`; an `unshaded` view in `why-is-it-dark`.
- `the-crate-by-the-ramp` used no markers: one `node_get_properties` with `paths` read the positions of the ramp and
  the eight crates, and the agent painted `Crate5`. By the rule of T12 the option goes unless a scenario shows a
  question that numbers cannot settle.
- `one-more-argument` passed every check of the game, but the agent found the callers with one `Grep`, which also
  finds the signal connection and the method track key of `arena.tscn` as text; it never called
  `script_find_references`, so the check of the tool failed.
- `blocks-from-a-scene`: `resource_create` set the names and meshes of the library items, but not `item/N/shapes`, a
  list of a shape and a transform for each shape, which the codec does not decode; the engine kept an empty list. The
  agent then built the library with a script of its own, run as a game scene. By the rule of T14, a tool
  `meshlibrary_create` follows.
- Twice, in `same-look-after-the-refactor` and `reach-the-island`, the agent first passed the operations of
  `scene_batch_edit` as a JSON string instead of a list, and the call was refused.

### A MeshLibrary from a scene, 2026-11-19

Task T14 added `meshlibrary_create`, which builds the library of a `GridMap` from a scene of blocks as the editor's
export does. The reference solution of `blocks-from-a-scene` now uses it, and writing the library as text stays as
the other solution. One rerun with the same model and Claude Code:

| Scenario | Checks | Tool calls | Cost, $ | Time, s |
|---|---|---|---|---|
| blocks-from-a-scene | 6/6 | 33 → 13 | 0.62 → 0.23 | 83 → 28 |

The agent found the tool with its first `ToolSearch`, built the library in one call and needed no script of its own.
