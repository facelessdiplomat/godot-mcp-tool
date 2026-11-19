# Plan for the next version

> Status: 0.3.0 was released on 2026-11-19: `godot-mcp-tool@0.3.0` on npm, commit `326d3cd`.
>
> This file holds what is left of the plan for 0.3.0, which came from a survey of the plan, the code and the
> evaluation results on 2026-11-19. What each finished task found is in §12 of the development plan ("Version 0.3.0")
> and in [the evaluation log](evals/README.md).

[DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) stays the place for decisions (Appendix A), verified engine facts
(Appendix B) and the record of what each finished task found (§12). This file holds only what is still to do.

## Contents

1. [What is left](#1-what-is-left)
2. [Rules for every task](#2-rules-for-every-task)
3. [Pictures, the comparison and the Asset Store](#3-pictures-the-comparison-and-the-asset-store)
4. [Larger tracks](#4-larger-tracks)
5. [Releasing a version](#5-releasing-a-version)
6. [What needs you](#6-what-needs-you)

---

## 1. What is left

| Task | What | State |
|---|---|---|
| T18 | The GitHub Actions workflow of the skill's `ci.md` | done, but it has not run on GitHub; it gets its first run when a game uses it |
| T19 | A screen recording for the top of both READMEs | the READMEs show a still of `editor_screenshot`; the recording was left out of 0.3.0, and its script is in `docs/media/README.md` |
| T20 | The comparison with an existing server | left out of 0.3.0; the runner takes the server under test from `EVAL_SERVER` |
| T21 | The Godot Asset Store | the listing, the license and README in the addon folder and `npm run pack:asset-store` are ready; the submission comes after 0.3.0 |
| T22 | Full 2D support | after 0.3.0 |
| T23 | Several instances of the game | after 0.3.0 |

## 2. Rules for every task

These repeat [CLAUDE.md](../CLAUDE.md) and §11.3 of the development plan, so a task below lists only what is special
about it.

- **Test first.** A failing test, then the least code that passes it, then the cleanup: vitest against the fakes in
  `server/test/support/` for the server, GUT in `test-project/tests/unit/` for the addon, and a test in
  `server/test/integration/` against a real editor for whatever needs `EditorInterface`.
- **A parameter before a tool.** The server has 96 tools. A task adds a tool only where no existing tool fits.
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

## 3. Pictures, the comparison and the Asset Store

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
4. A line in the release steps (§5): update the listing with every version.

**Done when.** The listing is submitted, and the release steps name it.

---

## 4. Larger tracks

Decided on 2026-11-19: both wait for the version after 0.3.0.

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

---

## 5. Releasing a version

The steps of 0.3.0, for the next release.

1. **A full run** of every scenario with an agent, when you say so: 51 scenarios cost $15.10 on 2026-11-19. Record it
   in `docs/evals/README.md` with the changes against the run before; fix what it finds and rerun the affected
   scenarios.
2. **Documents.** `npm run docs:tools`; `docs/usage.md` and `docs/setup.md`; in the development plan the catalog of
   §8, a new part of §12 with what each task found, Appendix B, §15 and §16. Finished tasks leave this file.
3. **The bridge protocol** keeps its number unless a released server and the new addon, or the other way round,
   can no longer work together. New methods alone do not need it: the handshake lists them.
4. **The version** changes in `server/package.json` and its lock file (`npm version <version> --no-git-tag-version`),
   `server/src/serverInfo.ts`, `addon/…/addon_info.gd`, `addon/…/plugin.cfg`, `plugin/.claude-plugin/plugin.json`,
   `plugin/.mcp.json`, `plugin/hooks/hooks.json`, `README.md` and the examples of `docs/setup.md`.
   `packageVersions.test.ts` guards them.
5. **Checks:** lint, types, unit tests, addon tests and integration tests on the pinned `master`, and CI on Godot
   4.7.2 and three systems through a pull request from a branch, before anything reaches `master`.
6. **The commit** "Release <version>" on `master`, not pushed yet.
7. **npm:** you publish from `server/`. npm processes a publish for a few minutes before it serves it, and the push
   follows only when `npm view godot-mcp-tool@<version>` answers, because the plugin of the marketplace asks npm for
   exactly that version.
8. **After the push:** CI on `master`; the published `gitHead` and checksum compared with the commit and a local
   `npm pack`; a new version of the Asset Store listing, packed with `npm run pack:asset-store` at the release commit
   as `docs/asset-store.md` says, once the store has the addon (T21); a line for users: `claude plugin update
   godot@godot-mcp-tool`, then `npx godot-mcp-tool update-addon` in each game.

---

## 6. What needs you

| What | For | When |
|---|---|---|
| The submission to the Asset Store | T21 | when you choose |
| A yes to the comparison: installing `hi-godot/godot-ai` at a pinned version and about thirty runs, $8–10 | T20 | when you choose |
| The decision on full 2D and several game instances | T22, T23 | before the next version is planned |
