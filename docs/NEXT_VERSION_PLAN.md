# Plan for the next version (0.3.0)

> Status: draft · 2026-11-19 · written after release 0.2.0 (commit `117944b`)
>
> The task list for the version after 0.2.0. It comes from a survey of the plan, the code and the evaluation
> results made on 2026-11-19. The number 0.3.0 is a working one: the version adds tools and changes none.

[DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) stays the place for decisions (Appendix A), verified engine facts
(Appendix B) and the record of what each finished task found (§12). This file holds only what is still to do.

## Progress

As of 2026-11-19. "Done" means the code, its tests and its documents are in the working tree and every check that
runs without an agent passes on the pinned 4.8 build; what each task still needs from you is named.

| Task | State | Still open |
|---|---|---|
| T1 | done | one check by hand with `claude -p` and the staged plugin (needs your yes: a run with an agent) |
| T2 | done; the agent run of `only-the-player-opens-the-door` passed (4/4) | — |
| T3 | done | — |
| T4 | done: 82 of 913 calls of the third full run were reads of a node right after a read of another | the reruns of `follow-the-player` and `extract-an-enemy-scene` with an agent |
| T5 | done | — |
| T6 | done | — |
| T7 | six scenarios with reference solutions; their writing found and fixed two gaps (dynamic properties, node paths); the six agent runs passed | — |
| T8 | done | one run by hand on GitHub after the push; the schedule starts on the default branch |
| T9 | done, with `reach-the-island`; the agent run passed and used `navigation_get_path` three times | — |
| T10 | done, with `silence-in-the-arena`; the agent run passed and listened with `in_game` | — |
| T11 | done, with `why-is-it-dark`; the agent run passed and looked at an `unshaded` view | — |
| T12 | done: `markers` of a view were built and tested with `the-crate-by-the-ramp`, but the agent run passed without them, reading the positions in one call, so by the rule of T12 the option was removed again; the scenario stays | — |
| T13 | done, with `same-look-after-the-refactor`; screenshots keep the last 100 captures; the agent run passed and used `compare_to` | — |
| T14 | `meshlibrary_create`, decided by the first agent run of `blocks-from-a-scene`, which could not set the item shapes and built the library with a script of its own; the rerun with the tool passed with 13 calls instead of 33, for $0.23 instead of $0.62, and without a script | — |
| T15 | done: `script_find_references` (way B), with `one-more-argument`. The spike (spikes.md §12) keeps way A, a language server in the plugin, for later: Claude Code runs it over stdio only and does not document what happens while the editor is closed. The scenario found that a windowless editor kept a changed script that no tab showed; `editor_rescan` now reloads it. The first agent run found the callers with `Grep` and passed every check but the one of the tool (6/7), so the tool stays and the scenario got a barrel with a `take_damage` of its own, which a text search mixes in; writing that version made the tool leave out the uses that the language server traces to a symbol of the same name in another script. The rerun with the barrel again used `Grep` (8/9): the agent saw the tool only by its name. With one line in the server instructions the third run called `script_find_references`, took its answer as the list of callers and passed 9/9 with 26 calls | — |
| T16 | `game_record_input`; the integration test `gameInputRecording.test.ts` presses keys in the game as a person would, and the recorded steps, replayed with `fixed_fps`, bring the player to the same place | one check by hand: a walk and a jump played at the keyboard come back as steps that replay to the same place |
| T17 | the subagent `plugin/agents/playtester.md` with a test of its tools, and the page `ui.md` of the skill; the plugin validates | the measurement with and without the subagent (two agent runs of `playtest-without-a-window`) |
| T18 | the prompts `profile`, `add_tests` and `setup_ci`, and the page `ci.md` of the skill; the workflow parses, and its archive names, sums and template layout match the 4.7.2 release. A probe found that GUT exits with 0 when a test script does not load, so the workflow looks for that error | one run of the workflow on a scratch repository with a small game |
| T19–T25 | not started | |

All checks above ran on the pinned `master` build only; CI runs them on 4.7.2 after the push. One window test fails
on this machine at commit `d7f3ef3` as well, so before this work: the second test of `windowedRescan.test.ts`, whose
rescan reports the editor error "Cannot change to 'res://enemies/' folder" in two runs of three.

Keep this work off `master` on GitHub until 0.3.0 is on npm: the plugin's `hooks.json` starts
`godot-mcp-tool@0.2.0`, which has no `check-scene-edit`, answers it with exit code 2, and a `PreToolUse` hook with
that code blocks the call, so every `Write` and `Edit` of a scene would fail for plugin users. The version bump of
T25 moves the hooks to 0.3.0 together with the package; until then CI can run on a branch through a pull request.

## Contents

1. [Where we start](#1-where-we-start)
2. [Rules for every task](#2-rules-for-every-task)
3. [All tasks at a glance](#3-all-tasks-at-a-glance)
4. [Phase 1 — Guard rails and first-run friction](#4-phase-1--guard-rails-and-first-run-friction)
5. [Phase 2 — Find the next gaps](#5-phase-2--find-the-next-gaps)
6. [Phase 3 — Checks by numbers](#6-phase-3--checks-by-numbers)
7. [Phase 4 — Content and code](#7-phase-4--content-and-code)
8. [Phase 5 — Plugin and packaging](#8-phase-5--plugin-and-packaging)
9. [Phase 6 — Larger tracks that need a decision](#9-phase-6--larger-tracks-that-need-a-decision)
10. [Release](#10-release)
11. [What needs you](#11-what-needs-you)

---

## 1. Where we start

- Milestones 0–9 of the development plan are done. The server has 91 tools, two prompts, four resources, a Claude
  Code plugin with a hook and a skill, and 37 evaluation scenarios.
- The third full evaluation run (2026-11-18) passed 31 of 32 scenarios for $9.38; the one failure was a faulty check.
  Of the five backlog scenarios of the same day, which cost $2.39, four needed tools that did not exist; nine tools
  came out of them.
- Open in the development plan: the comparison with an existing server (§13), the Godot Asset Store, full 2D
  support, several game instances, light baking.

Facts that the tasks below rely on, read from the code on 2026-11-19:

| Fact | Where |
|---|---|
| The plugin's hooks only check `.gd` and `.gdshader` files after they are written | `plugin/hooks/hooks.json` |
| Layer masks take numbers 1–32, never names; `layer_names/*` is read nowhere | `addon/…/codec/converters/flags_converter.gd` |
| The project is looked for in `CLAUDE_PROJECT_DIR`, then upwards from the working directory, never downwards | `server/src/project/ProjectLocator.ts` |
| `node_get_properties`, `game_get_properties` and `node_get_bounds` take one `path` | `server/src/tools/nodeTools.ts`, `gameInspectionTools.ts`, `placementTools.ts` |
| The language server client sends only `didOpen`, `didClose` and `rename`, and reads diagnostics | `server/src/lsp/LanguageServerClient.ts` |
| CI pins Godot `master` at a commit of 2026-10-20 and has no scheduled run | `.github/workflows/ci.yml` |
| Read-only mode is an environment variable of the server; the editor has a switch only for the unsafe tools | `server/src/server/ToolPolicy.ts`, `addon/…/editor/unsafe_tools_switch.gd` |
| The addon tracks one debugger session of the game | `addon/…/runtime/runtime_debugger.gd` |
| The README has no picture | `README.md` |

Engine facts, read with `docs_class` and `project_settings_get` from the pinned 4.8 build on 2026-11-19:

| Fact | Used by |
|---|---|
| `Image.compute_image_metrics(compared_image, use_luma)` returns `max`, `mean`, `mean_squared`, `root_mean_squared`, `peak_snr` | T13 |
| `NavigationServer3D.map_get_path(map, origin, destination, optimize, navigation_layers = 1) -> PackedVector3Array` | T9 |
| `AudioServer.get_bus_peak_volume_left_db(bus_idx, channel) -> float` | T10 |
| `Viewport.DebugDraw` has `UNSHADED` (1), `LIGHTING` (2), `OVERDRAW` (3), `WIREFRAME` (4), `NORMAL_BUFFER` (5) | T11 |
| `Camera3D.unproject_position(world_point) -> Vector2`, with `is_position_behind()` for points behind the camera | T12 |
| `debug/gdscript/warnings/untyped_declaration` exists and is `0` (ignore) by default | T5 |
| `layer_names/3d_physics/layer_1` exists and is empty by default | T2 |

---

## 2. Rules for every task

These repeat [CLAUDE.md](../CLAUDE.md) and §11.3 of the development plan, so a task below lists only what is special
about it.

- **Test first.** A failing test, then the least code that passes it, then the cleanup: vitest against the fakes in
  `server/test/support/` for the server, GUT in `test-project/tests/unit/` for the addon, and a test in
  `server/test/integration/` against a real editor for whatever needs `EditorInterface`.
- **A parameter before a tool.** The server has 91 tools. A task adds a tool only where no existing tool fits; the
  table in §3 says which ones do.
- **A changed tool is a changed interface.** Its description and `.describe()` texts get the same care as code.
  `npm run docs:tools` regenerates `docs/tools.md`; the skill names the tool where it helps, and
  `server/test/plugin/godotSkill.test.ts` keeps those names real.
- **A new bridge method** is a command class registered in `addon/…/commands/command_catalog.gd`, or in
  `addon/…/runtime/game_commands/game_command_catalog.gd` for the running game.
- **A scenario for every capability.** `docs/evals/<name>.md`, `server/test/evals/scenarios/<name>.ts`, a line in
  `allScenarios.ts` and a row in the table of `docs/evals/README.md`. `EVAL_REFERENCE=1 npm run eval` must pass with
  the reference solution and fail when the task is left unsolved. A run with an agent costs money on your account, so
  it starts only when you say so.
- **Engine behavior is verified, not assumed.** What a task learns about the engine goes to Appendix B of the
  development plan with the source file or "observed on 4.7.2 and 4.8".
- **Done** means `npm run lint`, `npm run typecheck`, `npm test`, `scripts/test-addon.sh` and
  `npm run test:integration` pass on Godot 4.7.2 and on the pinned `master` build.
- No comments in code, English everywhere, static types in GDScript, no AI attribution in commits.

Sizes: **S** is up to a day, **M** two to four days, **L** a week or more.

---

## 3. All tasks at a glance

"Was" is the number the item had in the survey of 2026-11-19; "plan" marks an item that was already open in the
development plan.

| Task | What | Was | Size | New tool | Depends on |
|---|---|---|---|---|---|
| **Phase 1** | | | | | |
| [T1](#t1-a-hook-that-keeps-scenes-and-resources-from-being-edited-as-text) | A hook that keeps scenes and resources from being edited as text | № 1 | S | — | — |
| [T2](#t2-physics-and-render-layers-by-name) | Physics and render layers by name | № 2 | S | — | — |
| [T3](#t3-find-a-project-that-lies-in-a-subfolder) | Find a project that lies in a subfolder | № 15 | S | — | — |
| [T4](#t4-read-several-nodes-in-one-call) | Read several nodes in one call | № 14 | S–M | — | — |
| [T5](#t5-typed-gdscript-in-new-projects) | Typed GDScript in new projects | № 17 | S | — | — |
| [T6](#t6-a-switch-in-the-editor-that-holds-the-agents-changes) | A switch in the editor that holds the agent's changes | № 16 | M | — | — |
| **Phase 2** | | | | | |
| [T7](#t7-six-scenarios-for-areas-that-no-scenario-covers) | Six scenarios for areas that no scenario covers | № 9 | M | — | — |
| [T8](#t8-a-nightly-run-against-the-head-of-godot-master) | A nightly run against the head of Godot `master` | № 3 | S | — | — |
| **Phase 3** | | | | | |
| [T9](#t9-ask-the-navigation-for-a-path) | Ask the navigation for a path | № 10 | M | `navigation_get_path` | — |
| [T10](#t10-sound-levels-of-the-running-game) | Sound levels of the running game | № 11 | S–M | — | — |
| [T11](#t11-render-modes-in-screenshots) | Render modes in screenshots | № 12 | S–M | — | — |
| [T12](#t12-node-markers-on-3d-views) | Node markers on 3D views | № 13 | M | — | T11 |
| [T13](#t13-compare-a-screenshot-with-an-earlier-one) | Compare a screenshot with an earlier one | № 6 | M | — | — |
| **Phase 4** | | | | | |
| [T14](#t14-a-meshlibrary-from-a-scene) | A `MeshLibrary` from a scene | № 5 | M | maybe `meshlibrary_create` | T7 |
| [T15](#t15-find-where-a-symbol-is-defined-and-used) | Find where a symbol is defined and used | № 4 | M | maybe `script_find_references` | — |
| [T16](#t16-record-what-the-player-does) | Record what the player does | № 7 | L | `game_record_input` | — |
| **Phase 5** | | | | | |
| [T17](#t17-a-playtester-subagent-and-a-ui-page-in-the-skill) | A playtester subagent and a UI page in the skill | № 8 | S + S | — | — |
| [T18](#t18-more-prompts-and-a-ci-page-in-the-skill) | More prompts and a CI page in the skill | № 19 | S–M | — | — |
| [T19](#t19-pictures-in-the-readme) | Pictures in the README | № 18 | S | — | — |
| [T20](#t20-the-comparison-with-an-existing-server) | The comparison with an existing server | plan | M | — | — |
| [T21](#t21-the-godot-asset-store) | The Godot Asset Store | plan | S | — | T19 |
| **Phase 6** | | | | | |
| [T22](#t22-full-2d-support) | Full 2D support | plan | L | — | decision |
| [T23](#t23-several-instances-of-the-game) | Several instances of the game | plan | L | — | decision |
| [T24](#t24-light-baking) | Light baking | plan | S–M | maybe one | T7, T8 |
| **Release** | | | | | |
| [T25](#t25-release-030) | Release 0.3.0 | — | S | — | all that ship |

The order inside a phase is the order of the table. Phases 1 and 2 can run side by side. T7 comes before the
phases 3 and 4 are fixed for good: its runs may add tasks or show that T14 and T24 need no tool.

The tool count goes from 91 to 93 for certain (T9, T16) and to at most 96 if T14, T15 and T24 each need their own.

---

## 4. Phase 1 — Guard rails and first-run friction

Small changes that every session meets. None adds a tool.

### T1. A hook that keeps scenes and resources from being edited as text

**Why.** ADR-7 says that scenes and resources change only through the editor, and the server instructions repeat it.
In the first run of `music-on-its-own-bus` the agent still edited `arena.tscn` as text. Nothing stops it: the plugin
has only `PostToolUse` checks for scripts and shaders.

**What.** A `PreToolUse` hook of the plugin for `Write` and `Edit` of `*.tscn` and `*.tres`. It runs a new command
of the package, `check-scene-edit`, which:

- finds the project of the file with `ProjectLocator`, as `check-edited-script` does;
- reads the discovery file `.godot/godot_mcp_tool/bridge.json` with the reader the server uses, and treats the editor
  as connected only when the record is not `closed` and its `pid` is alive;
- with a connected editor and a file that already exists, denies the call. The reason names what to use instead: the
  `scene_`, `node_` and `resource_` tools, `audio_buses_set` for a bus layout, `tileset_add_atlas` for a `TileSet`;
- stays silent in every other case: no editor, no project, a file that does not exist yet (nothing in the editor's
  memory can overwrite a new file), another extension.

Edits made through the shell are not seen; the server instructions stay the only rule there.

**Steps.**

1. `server/test/hooks/SceneEditGuard.test.ts`: a live editor denies; a closed or stale record, a new file, a file
   outside a project and a `.gd` file are silent.
2. `server/test/hooks/hookResponse.test.ts`: the denial has the form that Claude Code reads from a `PreToolUse`
   hook, a `permissionDecision` of `deny` with its reason.
3. `server/src/hooks/SceneEditGuard.ts`; the command in `server/src/cli/CommandLine.ts` and `runCommand.ts`.
4. Four entries in `plugin/hooks/hooks.json`, one per tool and pattern, since an `if` names one tool and one
   pattern (§8.12); `server/test/plugin/pluginHooks.test.ts` expects them and the pinned package version.
5. `server/test/integration/sceneEditHook.test.ts`, next to `editedScriptHook.test.ts`: the command against a real
   editor, open and closed.
6. One check by hand with `claude -p` and the staged plugin: the agent is told why the edit was refused and moves to
   the tools. Record it in §8.12.
7. `docs/usage.md` (Limitations), §8.12 and ADR-7 of the development plan.

**Done when.** With the editor open, `Edit` of an existing `.tscn` is refused with a reason that names the tools;
with the editor closed it goes through; the fourth full run (T25) has no scene or resource written as text.

### T2. Physics and render layers by name

**Why.** `collision_layer`, `collision_mask` and the other layer masks take a number or a list of layer numbers.
A project names its layers in `layer_names/<kind>/layer_<n>`, and the agent has to keep that table in its head.

**What.**

- Writing: a list may hold names next to numbers, such as `["world", "enemies", 5]`. The kind of layer follows the
  hint of the property: `2d_render`, `2d_physics`, `2d_navigation`, `3d_render`, `3d_physics`, `3d_navigation`,
  `avoidance`. An unknown name fails with the named layers of that kind.
- Reading: `node_get_properties` and `game_get_properties` show a mask with its layers and their names, such as
  `collision_mask = 5  (layers 1 "world", 3 "enemies")`.
- `project_info` lists the named layers of each kind that has any, so the agent learns them at the start.
- Naming a layer needs nothing new: `project_settings_set` writes `layer_names/3d_physics/layer_3`. A test proves it.

**Steps.**

1. GUT tests in `test-project/tests/unit/codec/`: names, numbers and both; an unknown name; a mask read with names.
2. `flags_converter.gd` for writing; the description of a property in `addon/…/scene/property_editor.gd`, which
   already knows the kind `flags`, for reading.
3. `server/test/tools/nodeTools.test.ts` and `projectTools.test.ts` for the texts; `sceneEditing.test.ts` and
   `projectEditing.test.ts` in the integration tests.
4. The `.describe()` of `properties`, the page `3d.md` of the skill ("Bodies and collisions"), `docs/tools.md`.
5. Scenario `only-the-player-opens-the-door`: an area that reacts to the layer `player` and ignores `enemies`, with
   the layers named in the starting project.

**Done when.** A mask is set and read by layer names in the editor and in the running game, and the scenario passes
with its reference solution.

### T3. Find a project that lies in a subfolder

**Why.** Many repositories keep the Godot project in a folder such as `game/`. The server then finds nothing and
asks for `GODOT_PROJECT_PATH`, which is the first thing a new user of the npm package sees.

**What.** When nothing is found upwards, `ProjectLocator` looks downwards from `CLAUDE_PROJECT_DIR`, or from the
working directory: at most three levels, skipping dot folders, `node_modules`, folders with a `.gdignore`, and never
below a folder that is itself a project. Exactly one project is used, with the new source `subfolder`. Several are
not guessed: the reason lists them and asks for `GODOT_PROJECT_PATH`.

**Steps.**

1. `server/test/project/ProjectLocator.test.ts`: one project below, two projects, a project in an ignored folder, a
   project at depth four, a project above still winning.
2. `ProjectLocator.ts`; `godot_status` names the source, as it does for the others.
3. `server/test/cli/` for `doctor`, which reports the same search. `install-addon` and `update-addon` use the one
   project that was found and name its folder in their report.
4. `docs/setup.md`: "No project is found" in the troubleshooting and the row of `GODOT_PROJECT_PATH`.

**Done when.** A session started in the root of a repository with one project in `game/` connects without any
variable, and with two projects the error names both.

### T4. Read several nodes in one call

**Why.** A scenario takes 15 to 40 tool calls, and checking a few nodes costs one call each. `node_snap_to_floor`
already takes `paths`.

**What.** `node_get_properties`, `game_get_properties` and `node_get_bounds` take `paths`, up to 20, instead of
`path`; exactly one of the two is given. The result has one block per node in today's format, under the limits of
§9.11. The running game reads all nodes in the same frame, so their values belong together.

**Steps.**

1. Measure first. The agent streams of the third full run lie in `server/test/evals/results/` (not in Git): count
   how often one of these tools is called twice or more in a row. If that is rare, close the task with the numbers.
2. vitest for the schemas (`path` or `paths`, not both, not neither) and the texts in `nodeTools.test.ts`,
   `gameTools.test.ts` and `placementTools.test.ts`.
3. GUT for the commands; `game_properties_get_command.gd` reads every node in one frame.
4. Integration: `sceneEditing.test.ts`, `gameInspection.test.ts`, `boundsAndScreenshots.test.ts`.
5. Descriptions, `docs/tools.md`, one line in `SKILL.md`.

**Done when.** One call returns the properties of several nodes, an unknown node among them is reported without
losing the others, and a rerun of two long scenarios (`follow-the-player`, `extract-an-enemy-scene`) needs fewer
calls than in the third run.

### T5. Typed GDScript in new projects

**Why.** The skill asks for static types, but nothing checks them: `untyped_declaration` is off by default, so
`script_validate` and the hook say nothing about untyped code.

**What.** `project_create` and `npx godot-mcp-tool init` write `gdscript/warnings/untyped_declaration=1` (warn) in
the `[debug]` section of `project.godot`. No new parameter: the user changes the setting like any other. For an
existing project `doctor` gives one line of advice when the warning is off, and `gdscript.md` of the skill says how
to turn it on with `project_settings_set`.

**Steps.**

1. `server/test/project/ProjectTemplate.test.ts` and `ProjectCreator.test.ts`.
2. `server/src/project/ProjectTemplate.ts`.
3. `projectCreation.test.ts`: in a created project a script with `var speed = 5` gets the warning from
   `script_validate`, with the editor and through `--check-only`. If `--check-only` does not print warnings, say so
   in §9.15 and in the result of `script_validate`.
4. `server/src/cli/Doctor.ts` with its test; `plugin/skills/godot/gdscript.md`; `docs/setup.md`.

**Done when.** A new project warns about an untyped declaration in `script_validate` and in the plugin's hook.

### T6. A switch in the editor that holds the agent's changes

**Why.** The user sometimes wants the scene to themself for a while. Read-only mode exists only as
`GODOT_MCP_READ_ONLY`, which needs a restart of the server; the risk "the agent and the user edit the same scene"
(§15) has no switch on the user's side.

**What.** "Hold Changes" in Project → Tools → Godot MCP Tool and in the Godot MCP panel, next to the switch for the
unsafe tools. It lasts for the editor session and is off when the editor starts.

- While it is on, every bridge command that changes the project or starts the game is refused with a new error,
  `CHANGES_HELD` (`-32011`), whose hint says that the user holds changes in the editor and that reading still works.
  `game_stop` and every read stay available.
- The commands are wrapped in the catalog the way `unsafe_command.gd` wraps the unsafe ones.
- `godot_status` says that changes are held. The panel shows the refused commands in its journal.
- Tools that do not go through the bridge (`test_run`, `export_project`) are not held in this version; the text of
  the switch says "changes to scenes, resources, files and settings".

The bridge protocol keeps its version: an older server shows the new error as a plain refusal.

**Steps.**

1. GUT: `held_command.gd` refuses while held and passes through otherwise; the catalog wraps exactly the commands
   whose tools are not read-only, which a contract test compares with the server's annotations.
2. vitest: the error text of `CHANGES_HELD` in `server/test/tools/bridge/`; `GodotStatusTool.test.ts`.
3. `addon/…/editor/changes_hold_switch.gd`, the toggle in `mcp_dock.gd`, the wiring in `editor_services.gd`,
   the code in `bridge/json_rpc.gd`.
4. Integration: `holdChanges.test.ts` (a change is refused, a read works, the switch off restores both) and
   `editorDock.test.ts`.
5. `docs/usage.md` (Safety), §7 (error list), §8.12 and §15 of the development plan.

**Done when.** With the switch on, `scene_batch_edit` is refused with a hint that names the switch, `scene_get_tree`
answers, and after switching it off the same edit applies.

---

## 5. Phase 2 — Find the next gaps

### T7. Six scenarios for areas that no scenario covers

**Why.** The cheapest way to learn what is missing: on 2026-11-18 five scenarios cost $2.39, and four of them
needed tools that did not exist. The 37 scenarios leave out particles, themes, joints, paths, skeletons and building
a `MeshLibrary`.

**What.** Six scenarios, each with a starting project, a reference solution and checks through the tools:

| Scenario | Request, in short | Checks |
|---|---|---|
| `sparks-on-impact` | A one-shot burst of `GPUParticles3D` where the ball hits the wall | the node, its material and `one_shot`; it emits on the hit in the running game and not before |
| `skin-the-menu` | One `Theme` for the menu: rounded dark buttons, a larger font | the saved theme, its use by the root control, the style of a button in the running game |
| `swing-the-gate` | A gate on a `HingeJoint3D` that the player pushes open | the joint and its two bodies; the gate turns when pushed and stays on its post |
| `ride-the-rail` | A cart that follows a `Path3D` around the level | the curve, a `PathFollow3D`, progress that grows, the cart on the curve |
| `sword-in-hand` | A sword that stays in the character's hand while it animates | a `BoneAttachment3D` on the hand bone; the sword follows it through an animation |
| `blocks-from-a-scene` | Turn a scene of blocks into a `MeshLibrary` and pave a floor with it | the library with its items and collision; the cells of the `GridMap` |

`sword-in-hand` needs a rigged model; if the character of `import-a-character` has no skeleton, its starting point
builds a `Skeleton3D` of two bones.

**Steps.**

1. For each: the document in `docs/evals/`, the code in `server/test/evals/scenarios/`, the line in
   `allScenarios.ts`, the row in the README table; `scenarioDocs.test.ts` passes.
2. `EVAL_REFERENCE=1 GODOT_BIN=<godot> npm run eval` passes each, and each fails unsolved.
3. One run per scenario with an agent, when you say so (about $3 by the earlier runs).
4. A section in `docs/evals/README.md` with the table and, for every failed call, one-off script and text edit, what
   the agent lacked.
5. Each finding becomes a fix or a task in this file. `blocks-from-a-scene` decides T14.

**Done when.** The six reference runs pass, the agent runs are recorded, and every finding has a task or a reason
why it needs none.

### T8. A nightly run against the head of Godot `master`

**Why.** "Engine regressions in the `master` build we target" is the first risk of §15, with a high likelihood. CI
tests one commit of 2026-10-20, so a break in the engine shows only when the pin moves.

**What.** A workflow `.github/workflows/godot-master.yml`, on a schedule once a night and on `workflow_dispatch`:

- builds the editor at the head of `master` with the steps of the `godot-master` job, moved into a reusable workflow
  so that both use the same build, and caches it by commit;
- runs `scripts/test-addon.sh` and `npm run test:integration`;
- writes the engine commit and the result into the job summary. It is no check of pull requests, so a red night
  blocks nothing.

`CONTRIBUTING.md` gets the steps for moving the pin: a green night for a commit, then `GODOT_MASTER_COMMIT` in
`ci.yml`, "Pinned engine" in `docs/spikes.md` and §4 of the development plan, and a look at the API dump for what
T24 waits for.

**Steps.**

1. The reusable build workflow, with `ci.yml` calling it; CI stays green.
2. The nightly workflow; one run by hand.
3. `CONTRIBUTING.md`; the mitigation of the first risk in §15.

**Done when.** A run started by hand builds the head of `master`, runs both test suites and names the commit; the
schedule is active on the default branch.

---

## 6. Phase 3 — Checks by numbers

The plan's rule for 3D is "numbers first, then pictures". These tasks add numbers where the agent now has only
pictures, or nothing.

### T9. Ask the navigation for a path

**Why.** `navigation_bake` reports polygons and area. Whether an agent can get from the spawn to the player is
found out only by running the game and watching.

**What.** A read tool `navigation_get_path`: `from`, `to`, `navigation_layers`, `in_game` and `scene`, shaped like
`scene_raycast`. It returns whether the path reaches `to`, its length, its points (the first and last few when
there are many) and, when it stops short, how far from `to` and at which point. An empty answer explains the usual
causes: no baked region, or a point too far from any polygon.

**Steps.**

1. Spike: does the navigation map of a scene open in the editor answer `map_get_path`, and after how many frames.
   If it does not, the tool works on the running game only and says so. The answer goes to Appendix B.
2. vitest for the tool in `navigationTools.test.ts`; GUT for the report (length, reached or not).
3. `addon/…/commands/navigation/navigation_path_command.gd` and a game command next to `game_raycast_command.gd`.
4. Integration in `navigationBake.test.ts`: a path across one region, and two regions with a gap between them.
5. `3d.md` of the skill ("Navigation"), `docs/tools.md`.
6. Scenario `reach-the-island`: an enemy that never reaches the player because two regions do not connect.

**Done when.** The tool tells a connected level from a broken one without running a chase, and the scenario passes.

### T10. Sound levels of the running game

**Why.** The agent cannot hear. A stream on a muted bus, a volume of -80 dB or a player that never starts all look
right in the scene.

**What.** `audio_buses_get` takes `in_game`, like `scene_raycast`, and a window in physics frames. For each bus it
adds the highest peak of the window in dB and whether that is silence, and it lists the players that are playing,
with their bus and stream.

**Steps.**

1. Spike: what the peaks read in a game without a window (the dummy audio driver) and with a window. If the dummy
   driver mixes nothing, the result says that levels need an audio device and still lists the players. Appendix B.
2. vitest in `audioTools.test.ts`; GUT for the window and the silence threshold.
3. A game command `game_audio_levels_command.gd`, registered in `game_command_catalog.gd`.
4. Integration in `audioBuses.test.ts`: a tone on `Music`, the same with the bus muted.
5. Scenario `silence-in-the-arena`: the music does not play; find out why and fix it.

**Done when.** A playing stream shows a level on its bus and on `Master`, a muted bus shows silence, and the
scenario passes.

### T11. Render modes in screenshots

**Why.** "Why is it black" and "where is the overdraw" are answered by the debug views of the 3D viewport, which
the screenshot tools do not offer: `debug_draw` of `game_run` draws shapes and paths only.

**What.** `render` in the `views` of `editor_screenshot` and `game_screenshot`: `unshaded`, `lighting`, `overdraw`,
`wireframe` or `normals`, next to the default. A view renders in a viewport of its own, so the mode is set there and
nothing of the user's changes.

**Steps.**

1. Spike on both renderers and both engine versions: which modes each renderer supports, and whether `wireframe`
   works in a running game, where wireframes must be generated before the meshes load. A mode that cannot work is
   refused with the reason and the renderer's name. Appendix B.
2. vitest in `captureTools.test.ts`; GUT for the view request.
3. `addon/…/capture/view_requests.gd` and `view_renderer.gd`.
4. Integration in `windowedScreenshots.test.ts`: an unshaded view of an unlit scene is not black.
5. `3d.md` ("Checking a 3D scene"), `docs/tools.md`.
6. Scenario `why-is-it-dark`: a level that renders black, where one room lacks light and one material is black.

**Done when.** The same view comes back in each supported mode, labelled with it, and the scenario passes.

### T12. Node markers on 3D views

**Why.** A model that looks at a contact sheet has to guess which box is `Crate7`. This is a hypothesis: whether
markers help is shown only by a run.

**What.** `markers` in a view: node paths, or the children of the target, at most 12. Each gets a number in the
picture at the projected center of its bounds, and the text lists the number, the path and the pixel position of
each. A node behind the camera or outside the frame is listed as not in view.

**Steps.**

1. vitest in `captureTools.test.ts`; GUT for the projection and the legend.
2. `addon/…/capture/`, on the labels that views already draw.
3. Integration in `boundsAndScreenshots.test.ts`: the marker of a node lies inside its projected bounds.
4. Scenario `the-crate-by-the-ramp`: the request names an object by where it stands, not by its node.
5. One run with an agent. If the agent does not use markers, or does no better with them, remove the option again
   and record why.

**Done when.** Markers land on their nodes, and the run decided whether the option stays.

### T13. Compare a screenshot with an earlier one

**Why.** "Nothing else changed" is checked today by looking at two pictures, which costs tokens and misses small
differences.

**What.** `compare_to` in `game_screenshot` and `editor_screenshot`: an earlier capture, by the path its result
gave, or an image of the project. The result adds whether the sizes match, the mean difference from
`compute_image_metrics`, the share of pixels that changed beyond a `tolerance`, and the rectangle that holds the
changes, which the picture outlines. The share and the rectangle are computed on a reduced copy, so the cost stays
small.

**Steps.**

1. Find out how long captures live in `.godot/godot_mcp_tool/captures/` (`capture_store.gd`), so that a baseline is
   still there, and say so in the description.
2. GUT for the comparison: equal images, one changed block, different sizes.
3. `addon/…/capture/image_comparison.gd`, used by the editor and by the game; vitest in `captureTools.test.ts`.
4. Integration in `windowedScreenshots.test.ts`: the same scene twice with `fixed_fps`, then with one node moved.
5. The description names what makes two runs differ: time, particles, temporal anti-aliasing; `fixed_fps` helps.
6. Scenario `same-look-after-the-refactor`: twelve crates become instances of one scene, and the level must look
   the same.

**Done when.** An unchanged scene compares as equal within the tolerance, a moved node gives a rectangle around it,
and the scenario passes.

---

## 7. Phase 4 — Content and code

### T14. A `MeshLibrary` from a scene

**Why.** `gridmap_set_cells` paints with a library that exists. Building one is the editor's Scene → Export As →
MeshLibrary; for tiles the same step has `tileset_add_atlas`. Whether `resource_create` can do it is not known.

**What.** Decided by `blocks-from-a-scene` of T7:

- If the agent builds the library with `resource_create` and `resource_set_properties`, without a one-off script and
  without failed calls, the task ends with a paragraph in the skill.
- Otherwise a tool `meshlibrary_create`: a scene whose `MeshInstance3D` nodes become the items, with the name of the
  node, its mesh and transform, the collision shapes of a `StaticBody3D` below it and a navigation mesh, as the
  editor's export does; `update` keeps the ids of the items of an existing library, because the cells of a `GridMap`
  store ids. The result lists the items with their ids.

**Steps.**

1. Read the editor's export in the engine source and note what it takes from the scene (Appendix B).
2. vitest in `gridMapTools.test.ts`; GUT for the item plan.
3. A command in `addon/…/commands/grid/`.
4. Integration in `gridMap.test.ts`: a library from a scene of two blocks, painted and collided with in the game.
5. The reference solution of `blocks-from-a-scene` uses the tool; one rerun with an agent.

**Done when.** The scenario passes with fewer calls than its first run and without a one-off script.

### T15. Find where a symbol is defined and used

**Why.** Before changing a function the agent greps for its name, which misses nothing by luck and matches too
much by habit. The editor's language server knows the answer; the client asks it only for diagnostics and renames.

**What.** A spike decides between two ways, and both may ship:

- **A, through Claude Code:** the plugin declares a language server whose command is a new `lsp-bridge` command of
  the package, which passes standard input and output to the port of the editor's language server from the discovery
  file. Claude Code then has its own navigation for GDScript. Only plugin users get it.
- **B, a tool:** `script_find_references`, addressed like `script_rename_symbol`. The result starts with the
  definition and lists the uses by file with their lines, and adds what the language server does not see and the
  rename already finds: method names in the signal connections of scenes and in method tracks of animations.

**Steps.**

1. Spike, recorded in `docs/spikes.md`: what the language server of 4.7.2 and 4.8 answers to `references`,
   `definition` and `hover`; what a Claude Code plugin may declare for a language server, what Claude Code does with
   it, and what happens while the editor is closed.
2. For B: `FakeLanguageServer` answers `references`; vitest for the client and the tool; the finder of scene and
   animation uses is shared with `ScriptRenameTool.ts`.
3. For A: the bridge command with a unit test against a fake TCP server; the plugin manifest; `pluginHooks.test.ts`
   or a new plugin test; `claude plugin validate plugin --strict`.
4. Integration: `symbolReferences.test.ts` next to `symbolRename.test.ts`.
5. Scenario `one-more-argument`: `take_damage` gets a second argument, and every caller follows, also a signal
   connection with a bound value.

**Done when.** The uses of a function across scripts, scenes and animations come back in one call, and the scenario
passes.

### T16. Record what the player does

**Why.** A bug that the user reproduces by hand is described to the agent in words. Recorded as steps of
`game_input`, it replays exactly with `fixed_fps` and becomes a test.

**What.** A tool `game_record_input` with `state: "start" | "stop"`. While it records, the runtime agent notes the
input events of the person playing, with the physics frame of each. `stop` returns steps in the format of
`game_input`: an input action where the event matches one, otherwise the key, mouse button, wheel, gamepad button,
axis or touch; holds are merged, and the pauses become `wait_physics_frames`. Input that `game_input` itself plays
is not recorded. A recording longer than the 200 steps of one `game_input` call is written to a file under
`.godot/godot_mcp_tool/`, and the result gives its path, the count and the first steps.

The result says what a replay needs: the same starting state and `fixed_fps`.

**Steps.**

1. Spike: where to listen so that events are seen before game code marks them as handled (the root window's input
   signal, or `_input` of the autoload); how mouse motion is kept when the mouse is captured; how analog sticks are
   reduced to steps. Appendix B.
2. GUT for the conversion of events to steps: an action, a key without an action, a hold, a stick, a click.
3. `addon/…/runtime/` for the recorder and a game command; vitest for the tool in `inputTools.test.ts`.
4. Integration in `gameInput.test.ts`: events sent to the game as a person's are recorded, and the replay with
   `fixed_fps` ends at the same position.
5. The skill: record, replay, then keep it as a test (`testing.md`).

No agent can run this scenario alone, since it needs a person at the keyboard; the integration test stands in for
it, and one check by hand with a real playthrough closes the task.

**Done when.** A walk and a jump played by hand come back as steps that `game_input` replays to the same place.

---

## 8. Phase 5 — Plugin and packaging

### T17. A playtester subagent and a UI page in the skill

**Why.** A playtest fills the conversation with screenshots and readings that only its conclusion needs. And four
scenarios are about UI (`health-bar-hud`, `pause-menu`, `resume-the-menu`, `hud-at-two-sizes`), while the skill has
pages for GDScript, 3D and testing only.

**What.**

- `plugin/agents/playtester.md`: a subagent of the plugin with the read and game tools of this server and no file
  tools. Its instructions are the steps of the `playtest` prompt; it returns what works, what does not, the numbers,
  the errors and the paths of its captures.
- `plugin/skills/godot/ui.md`: containers before anchors, anchor presets and size flags, `CanvasLayer` for a HUD,
  themes and overrides, focus and gamepad navigation, the stretch settings, pause menus and `process_mode`; and how
  to check UI: `editor_screenshot` with `sizes`, `node_get_bounds` of a control, `controls` of `game_get_tree`, a
  click on a control by its path.

**Steps.**

1. A test for `plugin/agents/*.md` beside `godotSkill.test.ts`: the frontmatter, and every tool named exists.
2. The agent file; `claude plugin validate plugin --strict`.
3. Measure with one scenario (`playtest-without-a-window`) with and without the subagent: the tokens of the main
   conversation and whether the report is as good. If it saves nothing, remove the agent and record why.
4. Find out which way of setting anchors works through `node_set_properties` and document that one.
5. `ui.md`, linked from `SKILL.md`; its GDScript samples compiled with `--check-only`, as the other pages were.

**Done when.** "Playtest the game" is delegated to the subagent and comes back as a report, and the skill test
passes with the new page.

### T18. More prompts and a CI page in the skill

**Why.** The server has two prompts, `playtest` and `fix_last_run`. Three more tasks come up again and again and
have a fixed shape.

**What.** Prompts, each argument one word (§8.10):

- `profile [scene]`: run, measure with `game_performance` and its function times, name the slowest part and a fix,
  without changing the project;
- `add_tests <script>`: tests for one script with the framework of the project, or after `test_install_framework`,
  by the conventions of `testing.md`, then `test_run`;
- `setup_ci`: a GitHub Actions workflow for the game from a new page `ci.md` of the skill: the official Godot build
  with its checksum, the import, the tests as `test_run` starts them, and an export.

**Steps.**

1. vitest in `server/test/prompts/` for each text; `resourcesAndPrompts.test.ts` lists them.
2. The prompt classes in `server/src/prompts/`, registered like `PlaytestPrompt`.
3. `ci.md` with the workflow; the workflow is run once on a scratch repository with a small game, by hand.
4. `docs/usage.md` (Slash commands); the Prompts section of `docs/tools.md` regenerates.

**Done when.** The three commands appear in Claude Code and their tests pass; the workflow of `ci.md` went green
once on a scratch repository.

### T19. Pictures in the README

**Why.** The README describes the project in words only. A visitor of GitHub or npm decides in seconds, and the
Asset Store asks for pictures anyway.

**What.** The first task of the README, the arena with walls and a ramp, as a short recording of Claude Code beside
the editor, plus two stills: the Godot MCP panel and a contact sheet of views. The files live in `docs/media/`; the
npm package takes only `dist` and `addon`, so it does not grow. `server/README.md` is the page on npm and needs
absolute links to the pictures.

**Steps.**

1. A script of the recording: the request, what to show, 30–40 seconds.
2. You record the screen; the stills come from the tools.
3. `README.md` and `server/README.md`; the recording under 3 MB.

**Done when.** The README on GitHub and the page on npm show the recording and the stills.

### T20. The comparison with an existing server

**Why.** §13 promises the same tasks on one existing server; it is the only open item of the evaluations. Without
it "we fix their typical failures" (§5) is a claim.

**What.** Ten scenarios whose requests name no tool of ours (`build-an-arena`, `third-person-prototype`,
`fix-the-jump-error`, `health-bar-hud`, `patrol-between-points`, `collect-coins`, `pause-menu`, `camera-follow`,
`animate-a-door`, `follow-the-player`), each run three ways: this server with its plugin, this server alone, and
`hi-godot/godot-ai`, the closest by features (§5). The checks stay ours and run through our tools after the agent
has finished.

**Steps.**

1. The runner takes the server under test from a setting instead of the fixed entry in `runScenario.ts`, and can
   leave the plugin out; a unit test covers both.
2. A starting point that installs the other server's addon at a pinned version beside ours.
3. The runs, when you say so: about thirty sessions, roughly $8–10 by the costs of the third run.
4. A section in `docs/evals/README.md`: passes, calls, failed calls, cost and time, and what the other server does
   better, each of which becomes a task.

It runs third-party code on your machine, so the version is pinned and you agree first.

**Done when.** The table is in the README of the evaluations, and §13 is no longer open.

### T21. The Godot Asset Store

**Why.** Open since milestone 5. The store replaced the Asset Library in 4.7 and is where Godot users look.

**What.** The listing of the addon: a description that says at once that it needs the npm server and links to
`docs/setup.md`, the icon, the pictures of T19, the license, Godot 4.7 as the minimum, and the version.

**Steps.**

1. Read the store's rules for a submission: what it takes (an archive or a repository at a commit), the sizes of
   the icon and the pictures, the review.
2. Prepare the text and the files; an archive of `addon/` if the store wants one, built by a script and checked to
   hold exactly the addon.
3. You submit it with your account.
4. A line in the release steps (T25): update the listing with every version.

**Done when.** The listing is submitted, and the release steps name it.

---

## 9. Phase 6 — Larger tracks that need a decision

Each of these is as large as several tasks above. The first step of each is your decision whether it belongs to
0.3.0 or to the version after. My recommendation: T24 with its scenario only, T22 and T23 after 0.3.0, because
phases 1–5 already hold twenty tasks and a release that waits for 2D waits a long time.

### T22. Full 2D support

**Why.** §12 calls it "a milestone of its own, about the size of milestone 7" that "pays off only if the published
package is meant for other people's projects". With npm, the plugin and the Asset Store, it is.

**What exists.** `tileset_add_atlas`, `tilemap_get_cells`, `tilemap_set_cells`; `editor_screenshot` of a UI or 2D
scene at window sizes; `node_get_bounds` of controls and 2D nodes; the scenario `a-level-of-tiles`.

**Tasks, if it is in.**

1. Views of a 2D world in `game_screenshot` and `editor_screenshot`: a region or a node to frame, and a zoom, from a
   viewport that shares the `World2D`, as the 3D views share the `World3D`.
2. `navigation_bake` for `NavigationRegion2D`, and `navigation_get_path` (T9) in 2D.
3. `scene_raycast` in 2D scenes.
4. `node_add_collision` for sprites and polygons: a rectangle, a circle, or a polygon from the opaque pixels.
5. `project_create` with a 2D main scene.
6. `2d.md` in the skill: a `CharacterBody2D` controller, `Camera2D` limits, tiles, sorting, pixel snap, layers.
7. Scenarios: `platformer-prototype`, `enemy-walks-the-maze`, `click-to-shoot`.
8. The server instructions and `docs/usage.md` stop saying "3D first".

**Done when.** The three scenarios pass with an agent, and no tool refuses a 2D scene without saying what to use.

### T23. Several instances of the game

**Why.** A multiplayer game needs a host and a client at once. It is in the backlog of §12, and the addon follows
one debugger session.

**What.** `game_run` takes `instances`, up to four, with arguments for each; every game tool takes `instance`,
0 by default; output and errors carry the instance; `game_stop` stops all.

**Tasks, if it is in.**

1. Spike: how the editor starts several instances from a script and which session each gets; without the editor,
   one process and one port for each. Appendix B.
2. `runtime_debugger.gd` and `LocalGameGateway.ts` keep one connection per instance.
3. `instance` in the game tools, one shared parameter; the log store tags entries.
4. Windows placed side by side, and `game_screenshot` of all instances in one labelled image.
5. Scenario `two-players-one-lobby`: a host and a client over ENet; the client sees the host's player move.

**Done when.** The scenario passes, and every tool without `instance` behaves as today.

### T24. Light baking

**Why.** In the backlog of §12. Only `VoxelGI.bake()` is bound for scripts; `LightmapGI` and `OccluderInstance3D`
have no bake method (API dump of 4.8 beta 2), so most of it waits for the engine.

**Tasks.**

1. Scenario `light-the-cave`: a `VoxelGI` that must be baked for the cave to be lit. Run it once with an agent
   (with T7). If the agent gets there with the tools it has, the task ends here.
2. Otherwise a tool, or an operation of an existing one, that bakes `VoxelGI` nodes and reports the size of the
   data; for a `LightmapGI` it refuses and says how to bake in the editor.
3. Each time the pinned commit moves (T8), look in the API dump for a bake method of `LightmapGI`; when it appears,
   this task gets its second half.

**Done when.** The scenario passes, by the existing tools or by the new one, and the steps for moving the pin name
the check.

---

## 10. Release

### T25. Release 0.3.0

1. **The fourth full run** of every scenario with an agent, when you say so: about fifty scenarios, roughly $15 by
   the costs of the third run. Record it in `docs/evals/README.md` with the changes against the third run; fix what
   it finds and rerun the affected scenarios.
2. **Documents.** `npm run docs:tools`; `docs/usage.md` and `docs/setup.md`; in the development plan the catalog of
   §8, a new part of §12 with what each task found, Appendix B, §15 and §16. Finished tasks leave this file.
3. **The bridge protocol** keeps its number unless a released server and the new addon, or the other way round,
   can no longer work together. New methods alone do not need it: the handshake lists them.
4. **The version** becomes 0.3.0 in `server/package.json` and its lock file, `server/src/serverInfo.ts`,
   `addon/…/addon_info.gd`, `addon/…/plugin.cfg`, `plugin/.claude-plugin/plugin.json`, `plugin/.mcp.json`,
   `plugin/hooks/hooks.json`, `README.md` and the examples of `docs/setup.md`. `packageVersions.test.ts` guards them.
5. **Checks:** lint, types, unit tests, addon tests and integration tests on 4.7.2 and the pinned `master`.
6. **The commit** "Release 0.3.0" on `master`, not pushed yet.
7. **npm:** you publish from `server/`. The push follows only when `npm view godot-mcp-tool@0.3.0` answers, because
   the plugin of the marketplace asks npm for exactly that version.
8. **After the push:** CI on the three systems; the published `gitHead` and checksum compared with the commit and a
   local `npm pack`; the listing in the Asset Store (T21); a line for users: `claude plugin update
   godot@godot-mcp-tool`, then `npx godot-mcp-tool update-addon` in each game.

---

## 11. What needs you

| What | For | When |
|---|---|---|
| A yes to runs with an agent: $8–10 (T20), $15 (T25); the runs of T7 and T9–T15 are done | T20, T25 | before each batch |
| A yes to installing `hi-godot/godot-ai` at a pinned version on this machine | T20 | before T20 |
| The decision on T22, T23 and T24: in 0.3.0 or after | phase 6 | by the end of phase 2 |
| A scratch repository on GitHub with a small game, or a yes to make one, to run the workflow of `ci.md` once | T18 | before the release |
| A walk and a jump played at the keyboard while Claude records them with `game_record_input`, to see them replay to the same place | T16 | before the release |
| The screen recording | T19 | phase 5 |
| The submission to the Asset Store | T21 | after T19 |
| `npm publish` | T25 | at the release |
