# Godot MCP — Development Plan

> Status: draft v0.2 · 2026-10-21 · repository `godot-mcp-tool`
>
> This document describes **what** we are building, **how** it works and **in what order** we build it.
> Decisions made along the way go to [Appendix A](#appendix-a-decision-log-adr).

## Contents

1. [Summary](#1-summary)
2. [Goals, non-goals, principles](#2-goals-non-goals-principles)
3. [Decisions](#3-decisions)
4. [Environment](#4-environment)
5. [Existing solutions](#5-existing-solutions)
6. [Architecture](#6-architecture)
7. [Bridge protocol (server ⇄ editor)](#7-bridge-protocol-server--editor)
8. [MCP tool catalog](#8-mcp-tool-catalog)
9. [Key technical decisions and pitfalls](#9-key-technical-decisions-and-pitfalls)
10. [Security](#10-security)
11. [Stack and repository layout](#11-stack-and-repository-layout)
12. [Milestones](#12-milestones)
13. [Testing and evaluation](#13-testing-and-evaluation)
14. [Connecting to Claude Code](#14-connecting-to-claude-code)
15. [Risks](#15-risks)
16. [Next steps](#16-next-steps)
- [Appendix A. Decision log (ADR)](#appendix-a-decision-log-adr)
- [Appendix B. Verified Godot API facts](#appendix-b-verified-godot-api-facts)
- [Appendix C. Sources](#appendix-c-sources)

---

## 1. Summary

We are building an MCP server that gives Claude Code "hands and eyes" inside Godot:

- drive the editor — scenes, nodes, signals, resources, project settings, Input Map;
- run the game and **see the result** — logs, errors with stack traces, screenshots (in 3D, from any camera angle),
  node property values;
- **interact** with the running game — press keys and actions, move the mouse, click, wait for conditions;
- validate GDScript before running it and read the documentation of **exactly the engine build** that is installed.

The core idea is to close the development loop, so the agent doesn't need a human to verify every step:

```
write code / build a scene → validate scripts → run → observe (logs, errors, screenshots, state) → fix
```

The system has three parts:

1. **MCP server** (`server/`, TypeScript, stdio) — launched by Claude Code. Defines the tools, validates parameters,
   formats responses, and talks to the editor, to the GDScript language server and to the Godot CLI.
2. **Editor addon** (`addons/godot_mcp_tool/`, GDScript) — lives in the open editor, runs a local bridge
   (TCP on 127.0.0.1 with a token) and executes commands through `EditorInterface` and `EditorUndoRedoManager` —
   **every change the agent makes can be undone with Ctrl+Z**.
3. **Runtime agent** (an autoload in the running game) — talks to the editor over the built-in debugger channel
   (`EngineDebugger` ⇄ `EditorDebuggerPlugin`): screenshots, input simulation, the scene tree, log and error capture
   via the `Logger` API.

There are already quite a few Godot MCP servers (§5). We adopt their proven patterns and fix their typical failures:
dropped connections, incomplete error capture, property writes that silently don't apply, and agent edits
overwritten by a stale copy held in editor memory.

Target: **Godot 4.8** (the `master` build) first, **4.7 stable** in CI; the minimum supported version is **4.5**
(it introduced `Logger` and `ScriptBacktrace`). The game is **3D** and written in **GDScript**; the only client is
**Claude Code** (§3).

Order of work: skeleton and spikes → MVP "editor under control" → "eyes and hands" (runtime, diagnostics, docs,
3D views) → project settings, resources, tests → 3D tooling and advanced features → polish and distribution.

---

## 2. Goals, non-goals, principles

### Goals

- **Closed feedback loop.** The agent runs the game itself and checks the result: output, errors with stack traces,
  screenshots, node properties.
- **Godot-aware operations.** Things that are unreliable to do by editing `.tscn`/`.tres` text: creating scenes and
  nodes with the right `owner`, signals, sub-resources, UIDs, import, project settings, Input Map, autoloads.
- **API accuracy.** A class reference generated from the installed engine, so the agent doesn't write Godot 3 code
  (`yield`, `KinematicBody`, `Spatial`, `export var`, `connect("signal", self, "method")`).
- **Reversibility and transparency.** All editor changes go through Undo/Redo and are visible to the user; scenes are
  saved explicitly.
- **Context economy.** Compact responses, depth and count limits, cursors; by default only properties that differ
  from their defaults.

### Non-goals

- Duplicating Claude Code's file tools (reading, writing and searching `.gd` files) — they already exist; the MCP
  complements them.
- Godot 3.x.
- C#/.NET — GDScript only (§3).
- MCP clients other than Claude Code — they will probably work, but we neither test nor tune for them (§3).
- Network or cloud operation, multi-user mode — local machine only.
- Asset generation (art, audio) — a job for other tools.

### Tool design principles

- Tools serve **the agent's tasks**; they are not one-to-one wrappers around every API method.
- Names follow `area_action`: `scene_get_tree`, `node_add`, `game_screenshot`. In Claude Code they appear as
  `mcp__godot__scene_get_tree`.
- Every tool has a "when to use" description (key information first — Claude Code truncates long descriptions),
  a strict parameter schema and honest `readOnlyHint` / `destructiveHint` / `idempotentHint` annotations.
- Errors **say what to do next**: "Editor not connected: open the project in Godot with the plugin enabled, or call
  `editor_launch`", "Node `Player/Mesh` not found. Similar: `Player/MeshInstance3D`". These are results with
  `isError: true`; protocol errors are reserved for unknown tools and malformed requests.
- **Every response reports new errors** since the previous call: "⚠ 2 new errors in the game — see
  `game_get_output`". The agent doesn't have to remember to check the logs.
- **Writes are verified by reading back:** after setting a property, the addon reads it back. The report says what
  actually applied and what didn't; nothing fails silently.
- Several edits go into **one atomic batch** and one Undo action (`scene_batch_edit`); on error the whole batch rolls
  back.
- The default output is compact text (a tree, a table); read tools accept `detail: "brief" | "full"`.
- Rare tasks get an escape hatch (`editor_run_script`, `game_eval`), disabled by default.

---

## 3. Decisions

Answers to the open questions of v0.1 (2026-10-21):

| Question | Decision | Consequences |
|---|---|---|
| Godot version for the game | **4.8 from `master`** (the local source build) | 4.8 is the primary test target; 4.7 stable runs in CI; the minimum stays 4.5; we pin the engine commit we test against and update it deliberately |
| 2D or 3D | **3D** | 3D tools come first: renders from arbitrary cameras, node bounds, model import, navigation baking (§8.9); TileMap tools move to the backlog |
| Scripting language | **GDScript only** | no C#/.NET support planned |
| License and publication | **Open source, MIT** | public GitHub repository; later npm (the name `godot-mcp-tool` was free on 2026-10-21) and the Godot Asset Store |
| Language | **English everywhere** | code, tool descriptions, server instructions, README and `docs/` are in English |
| MCP clients | **Claude Code only** | we use Claude Code extensions freely (`alwaysLoad`, `requiresUserInteraction`, hooks, skills, plugins) and drop tool profiles for other clients (ADR-9) |
| Game repository | **Separate repository** | this repository keeps `test-project/` for integration tests; during development the addon is symlinked into the game project (§14) |

---

## 4. Environment

As of 2026-10-21:

| Item | Value |
|---|---|
| Godot | built from source: `~/Software/godot`, branch `master`, `4.8.beta.custom_build.679066724` (commit of 2026-10-20), no .NET |
| Editor binary | `~/Software/godot/bin/godot.macos.editor.arm64` and the bundle `bin/godot_macos_editor.app`. `bin/Godot` is a Finder alias and cannot be run from a shell |
| Latest stable | Godot 4.7 (2026-06-18) |
| Platform | macOS, Apple Silicon (arm64) |
| Node.js / npm | v26.12.0 / 11.20.0 |
| Python / uv | 3.15.0 / 0.13.1 |
| Claude Code | desktop app; no `claude` CLI on `PATH` (the latest version on npm is 2.1.306) |
| MCP | specification 2026-07-28; TypeScript SDK v2 (`@modelcontextprotocol/server` 2.3.1) |
| Repository | `godot-mcp-tool`: git repository on `master` with a local identity `facelessdiplomat`; milestone 0 in progress |

Because Godot is built from source, every engine API assumption in this plan was checked against the engine code
(see [Appendix B](#appendix-b-verified-godot-api-facts)).

---

## 5. Existing solutions

As of 2026-10-21; GitHub stars are approximate; links are in [Appendix C](#appendix-c-sources).
There is no official MCP server from the Godot Foundation or W4 Games. The proposal for a built-in AI assistant was
closed as "not planned", with third-party add-ons recommended instead. Nothing MCP-related appeared in Godot 4.6–4.8.

| Project | Status | Architecture | Strengths | Known problems |
|---|---|---|---|---|
| [hi-godot/godot-ai](https://github.com/hi-godot/godot-ai) | ~3.1k★, MIT, v4.3.0 (2026-10), Godot 4.7+ | Python (FastMCP, `uvx`) → stdio bridge → HTTP :8000 → WebSocket :9500 → addon; the game via the debugger channel | 46 tools (19 plain + 27 `*_manage` tools with an `op` parameter), Undo/Redo, editor and game screenshots including a cinematic camera render, frame-timed input sequences, pause and step, new-error counts in every response, diagnostics on script writes, ClassDB, tests, atomic `batch_execute` | occupied ports and connection failures; writes to `Array[T]` silently dropped; `scene_save` overwrote scripts on disk with a stale copy from editor memory; telemetry on by default |
| [Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp) | ~6.2k★, MIT, npm 0.1.1 | TypeScript, no addon: Godot CLI only (`--headless --script`) | simple, installs via `npx` | 14 tools; output from stdout only; no screenshots, input, runtime or Undo; had an RCE via shell injection in the project path; debug logs on stdout broke the protocol |
| [satelliteoflove/godot-mcp](https://github.com/satelliteoflove/godot-mcp) | ~180★, MIT, `npx` | the addon is a WebSocket server on 127.0.0.1:6550; the game via the debugger protocol | 21 tools / 86 actions, separate read and write tools, deterministic playtesting (freeze time and step), docs matched to the editor version | unstable WebSocket handshake; the server process doesn't exit on Windows |
| [tomyud1/godot-mcp](https://github.com/tomyud1/godot-mcp) (Godlink) | ~440★, MIT, v0.6.0 | Node is a WebSocket server on :6505, the editor and the game are clients; extra server instances forward calls to a "primary" one over HTTP :6506 | 69 tools, script validation, ClassDB, batch edits, listed in the Asset Store | its own snapshot-based undo, so Ctrl+Z doesn't revert AI changes; "never connects" (IPv6 binding, a stale process holding the port) |
| [Godot MCP Pro](https://github.com/youichi-uda/godot-mcp-pro) | ~630★; addon MIT, server paid | the addon is a WebSocket client of the server (ports 6505–6509); the game via file exchange in `user://` | 160+ tools, full/lite/minimal profiles, Undo/Redo, animation, tilemaps, export | modal editor dialogs block work; stale ports; key simulation broke; mixed tabs and spaces broke GDScript |
| [GDAI MCP](https://gdaimcp.com) | ~100★, paid ($19) | a native library in the addon + a Python adapter via `uv` | 31 tools, screenshots, input simulation, .NET build errors | Gatekeeper blocks the dylib; unauthenticated HTTP; problems with spaces in paths |
| [ee0pdt/Godot-MCP](https://github.com/ee0pdt/Godot-MCP) | ~620★, MIT, abandoned since 2025-03 | the addon is a WebSocket server on :9080 | one of the first; Undo for property changes | WebSocket on all interfaces without auth — RCE (CVSS 9.6); assigning a script by path "succeeded" but did nothing |

Also: [Godot-MCP-Native](https://github.com/yurineko73/Godot-MCP-Native) (a GDScript MCP server inside the editor,
over HTTP), [GoPeak](https://github.com/HaD0Yun/Doyunha-Gopeak) (LSP + DAP, tool groups enabled on demand),
[tugcantopaloglu/godot-mcp](https://github.com/tugcantopaloglu/godot-mcp) (157 tools).

### What we adopt

- **A live editor addon plus a thin stdio server.** CLI-only projects can't offer screenshots, playtesting or tests —
  their most requested features.
- **Runtime access via the debugger channel** (like godot-ai and satelliteoflove) rather than extra sockets or file
  exchange.
- **Undo/Redo via `EditorUndoRedoManager`** and atomic edit batches.
- **Verification loops:** script diagnostics, new-error counts in every response, an API reference, structured
  runtime state before screenshots.
- **Deterministic playtesting:** fixed FPS, pause and step.
- **Security:** loopback only, a token, processes without a shell, logs on stderr only.

### Where almost everyone fails — and our answer

| Failure | Our answer |
|---|---|
| Connection lifecycle: occupied ports, IPv6, stale processes, shutdown on Windows | the editor picks an ephemeral port and writes it to a discovery file together with its pid and a token; the client connects strictly to `127.0.0.1`; lazy connect and reconnect; the server exits when stdin closes (§9.12) |
| Incomplete error capture: the Output panel, the Debugger tab and startup errors live separately | `Logger` in the game (with backtraces) and in the editor, plus the game's log file for errors that happen before the agent starts (§9.6) |
| Silent write failures: resources, `Array[T]`, custom classes | a typed codec and read-back verification (§9.1) |
| Unclear source of truth: editor memory or disk | an explicit rule and a sync before saving and running (§9.3) |
| Context overload: hundreds of tools, unbounded output | about 65 tools across all milestones, Claude Code tool search, cursors and limits (§8.12, §9.11) |
| Docs for the wrong engine version | the API reference dumped by the installed engine (§8.6) |

### Build or reuse

Feature-wise, `hi-godot/godot-ai` (MIT) is closest to our goal. We build our own, as requested: a Node-only stack
without the Python/uv chain or telemetry; a design built around Claude Code (tool search, output limits,
confirmation of dangerous tools, slash commands from prompts, hooks, skills); fixes for the failures above; support
for a `master` build of the engine. Existing servers serve as a baseline: we run the same evaluation tasks (§13)
against one of them.

---

## 6. Architecture

### 6.1 Overview

```
             ┌────────────────────────────┐
             │ Claude Code                │
             └─────────────┬──────────────┘
                           │ stdio · MCP (JSON-RPC)
             ┌─────────────▼──────────────┐
             │ MCP server (TypeScript)    │── spawn ──► godot --headless …
             │ • tools and schemas        │             import, check-only, API dump,
             │ • bridge client            │             tests, export, running the
             │ • LSP client (GDScript)    │             game without the editor
             │ • docs index               │
             └──────┬──────────────┬──────┘
  TCP 127.0.0.1     │              │ LSP, TCP :6005
  NDJSON + token    │              │
             ┌──────▼──────────────▼──────┐
             │ Godot editor               │
             │ addons/godot_mcp_tool      │
             │ • TCP bridge, discovery    │
             │ • commands: EditorInterface│
             │ • Undo/Redo, Logger        │
             │ • EditorDebuggerPlugin     │
             └─────────────┬──────────────┘
                           │ debugger channel (TCP :6007), "mcp:*" messages
             ┌─────────────▼──────────────┐
             │ Running game               │
             │ autoload GodotMcpRuntime   │
             │ • screenshots, input       │
             │ • scene tree, properties   │
             │ • Logger: logs and errors  │
             └────────────────────────────┘
```

### 6.2 Components

**MCP server (`server/`)**

- Launched by Claude Code as a stdio process. stdout carries MCP only; the server's own logs go to stderr.
- Finds the project: `GODOT_PROJECT_PATH` → `project.godot` in `CLAUDE_PROJECT_DIR` (Claude Code passes this
  variable to servers) → a search upwards from the working directory. Finds the Godot binary: `GODOT_BIN` → the
  connected editor → the editor that last opened the project (recorded in its discovery file) → `godot`/`godot4` on
  `PATH` → standard install locations on macOS, Linux and Windows.
- Side-effect-free startup: it connects to the editor lazily, on the first tool call, and never launches Godot at
  startup (§9.13).
- Connects to the addon through the discovery file and reconnects after editor restarts. The tool list is static:
  a tool that needs the editor returns a clear error when the editor is missing instead of disappearing.
- An LSP client for the built-in GDScript language server (port 6005) provides script diagnostics.
- A CLI runner: `--headless --import`, `--check-only`, `--dump-extension-api-with-docs`, `--doctool --gdscript-docs`,
  running the game as a process, tests, export.
- A docs index built from the API dump of the installed engine, cached per engine version.
- A log store with cursors; it also produces the new-error summary attached to every response.
- The server knows nothing about scene internals: Godot logic runs in the addon. The server owns schemas, validation,
  formatting, size limits and error texts.

**Editor addon (`addons/godot_mcp_tool/`)**

- `EditorPlugin` (`@tool`): when enabled, it starts a `TCPServer` on `127.0.0.1` (ephemeral port by default), writes
  the discovery file, and registers an `EditorDebuggerPlugin` and the runtime autoload (first in the autoload list,
  so its `Logger` catches errors from the other autoloads).
- Sockets are polled in `_process` on the main thread — editor APIs may only be called from there. The command queue
  runs with a per-frame time budget so the editor doesn't stall.
- Serves several clients at once (e.g. two Claude Code windows): commands run one at a time, events go to everyone.
- Command dispatcher: `method` → a handler in `commands/*.gd`. Long operations use `await` (filesystem scan, game
  start, next frame).
- Variant codec JSON ⇄ Godot types (§9.1).
- Its own `Logger` in the editor process catches parse, import and shader errors raised in the editor.
- Milestone 5 adds a small dock: connection status, a log of recent agent commands, toggles for dangerous features.

**Runtime agent (autoload `GodotMcpRuntime`)**

- Active only when the game runs with a debugger attached (`EngineDebugger.is_active()`); does nothing in exported
  release builds.
- Receives commands via `EngineDebugger.register_message_capture("mcp", …)` and replies via
  `EngineDebugger.send_message("mcp:…", […])`.
- A `Logger` subclass (`OS.add_logger`) captures `print`, errors, warnings, script and shader errors together with
  `ScriptBacktrace`. The buffer is thread-safe (`Mutex`) and flushed once per frame.
- Commands: viewport screenshots and renders from extra cameras, input (`Input.parse_input_event`,
  `Input.action_press/release`), waiting for frames or conditions, the scene tree, reading and writing properties,
  `Expression`, `Performance` monitors, pause and step.

**Godot CLI (headless)** works without an open editor: import, script checks, docs, running the game and tests,
export. Milestone 4 adds a "headless editor" mode (`--headless --editor`) in which the same addon runs, giving the
full toolset without a window. This needs a spike (milestone 0).

### 6.3 Key flows

**Editing a scene (`node_add`)**

1. Claude Code calls `node_add` with
   `{scene: "res://levels/arena.tscn", parent: ".", type: "MeshInstance3D", name: "Crate", properties: {position: [0, 0.5, 0], mesh: {"new": "BoxMesh", "size": [1, 1, 1]}}}`.
2. The server validates the schema and sends `node.add` over the bridge.
3. The addon opens the scene if needed and creates the node. The codec turns `[0, 0.5, 0]` into
   `Vector3(0, 0.5, 0)` and `{"new": "BoxMesh", …}` into an embedded `BoxMesh`. Everything is a single
   `EditorUndoRedoManager` action ("MCP: Add Crate") with `owner` set to the scene root. The properties are then read
   back and compared.
4. The response contains the new node's path and a per-property report (applied / rejected and why). The scene is
   marked unsaved; `scene_save` or the `save: true` flag saves it.

**Running and observing (`game_run`)**

1. The server asks the addon to sync the editor with the disk (§9.3), then sends `game.run`.
2. Through the `_run_scene` hook the addon adds launch arguments (e.g. `--ignore-error-breaks`, and `--headless`
   when the editor itself runs headless, because the editor doesn't forward it) and calls
   `EditorInterface.play_main_scene()` / `play_custom_scene()`.
3. The runtime agent starts in the game and sends `mcp:ready` (version, window size, current scene). Logs and errors
   stream as `mcp:log`.
4. The server waits for `ready`, a crash or a timeout and returns the status with the first errors and output.
5. Then: `game_input` → `game_wait` → `game_screenshot` (optionally from several camera angles) /
   `game_get_properties` → `game_get_output` (cursor-based, only new entries) → `game_stop`.

**Checking a script (`script_validate`)**

- Editor open: the LSP client sends `initialize`, then `textDocument/didOpen` with the file text, and waits for
  `textDocument/publishDiagnostics` — the analyzer's errors and warnings with positions.
- No editor: `godot --headless --path <project> --check-only --script res://file.gd` and parsing of stderr
  (limitations in §9.15).

---

## 7. Bridge protocol (server ⇄ editor)

- **Roles:** the addon is the server, the MCP server is the client
  ([ADR-8](#adr-8-the-addon-is-the-server-the-mcp-server-is-the-client)).
- **Transport:** TCP on `127.0.0.1`, **NDJSON** framing (one JSON object per line), **JSON-RPC 2.0** semantics:
  `id`, `method`, `params` → `result` or `error`; notifications have no `id`.
  Why not WebSocket or HTTP — see [ADR-3](#adr-3-tcp--ndjson-instead-of-websocket-or-http).
- **Discovery file** `<project>/.godot/godot_mcp_tool/bridge.json` (`.godot/` is git-ignored by default):

  ```json
  {
    "protocol": 1,
    "port": 50731,
    "token": "<128 random bits, base64>",
    "pid": 41234,
    "godot_version": "4.8.beta.custom_build.679066724",
    "addon_version": "0.1.0",
    "project_path": "/Users/…/my-game",
    "executable_path": "/Applications/Godot.app/Contents/MacOS/Godot",
    "lsp_port": 6005,
    "game_log_path": "/Users/…/Library/Application Support/Godot/app_userdata/My Game/logs/godot.log",
    "started_at": "2026-10-21T18:00:00Z"
  }
  ```

  The server checks that the `pid` process is alive and ignores a stale file. `executable_path` lets the server find
  the Godot binary without any configuration while the editor runs; `game_log_path` is added in milestone 1.
- **Handshake:** the client's first message is `hello {token, protocol, client}`. A wrong token or an incompatible
  version means an error and a disconnect. The reply carries versions and the list of supported methods.
- **Errors:** the standard `-32601` (method not found) and `-32602` (invalid params), plus our own codes in
  `-32000…-32099`: `EDITOR_BUSY`, `NOT_FOUND`, `NO_SCENE`, `GAME_NOT_RUNNING`, `CONFLICT`, `TIMEOUT`,
  `UNSAFE_DISABLED`. `error.data.hint` carries advice for the agent.
- **Notifications from the addon:** `game.started`, `game.stopped`, `game.breaked`, `log` (batched),
  `filesystem.changed`, `scene.changed`.
- **Timeouts:** a `ping` every 10 s; the default request timeout is 30 s; long operations send progress
  notifications.
- **Binary data** (screenshots) doesn't travel inside JSON: the file is written to
  `<project>/.godot/godot_mcp_tool/captures/` and the response carries its path.

Example exchange:

```jsonc
// server → addon
{"jsonrpc":"2.0","id":7,"method":"node.add","params":{"scene":"res://levels/arena.tscn","parent":".","type":"MeshInstance3D","name":"Crate","properties":{"position":[0,0.5,0],"mesh":{"new":"BoxMesh","size":[1,1,1]}}}}
// addon → server
{"jsonrpc":"2.0","id":7,"result":{"path":"Crate","applied":["position","mesh"],"rejected":[]}}
// addon → server (notification)
{"jsonrpc":"2.0","method":"log","params":{"source":"game","entries":[{"seq":118,"level":"script_error","message":"Invalid access to property 'velocity' on a base object of type 'Nil'.","file":"res://player/player.gd","line":42,"stack":[{"file":"res://player/player.gd","line":42,"function":"_physics_process"}]}]}}
```

The **editor ⇄ game** channel uses the same command format inside debugger messages:
`EditorDebuggerSession.send_message("mcp:cmd", [id, method, params])` → game →
`EngineDebugger.send_message("mcp:reply", [id, result_or_error])`.

---

## 8. MCP tool catalog

Legend. **M** — milestone (§12). **Kind**: R — read-only, W — modifies, D — potentially destructive.
**Needs**: E — open editor, G — running game, C — the Godot CLI is enough.

About 65 tools across all milestones; 16 in the MVP.

### 8.1 Status and project

| Tool | What it does | M | Kind | Needs |
|---|---|---|---|---|
| `godot_status` | Editor connection; Godot, addon and protocol versions; open scenes; game state (running / paused on error); binary path; warnings about editor settings | 1 | R | — |
| `project_info` | Name, main scene, renderer, 3D physics engine, window size and stretch mode, autoloads, plugins, the project's own global classes (`class_name`, up to 50) and the number of global classes in each addon folder, indentation style, top-level folders | 1 | R | C/E |
| `project_settings_get` | Values by key or prefix | 1 | R | C/E |
| `project_settings_set` | Change settings through the editor's `ProjectSettings` and `save()` | 1 | W | E |
| `input_map_get` / `input_map_set` | Input actions in a simple format: key names such as `"Space"` or `"Ctrl+S"`, `{"type":"mouse_button","button":"left"}`, `{"type":"joypad_button","button":"a"}`; `null` removes an action | 2 | R/W | E |
| `autoload_add` / `autoload_remove` | Autoloads (the list is part of `project_info`) | 3 | W | E |

`project_info` lists the project's own global classes with their base classes and paths, up to 50, and counts the
classes of each folder in `res://addons/` instead of listing them, because gdUnit4 alone declares about 200: "Global
classes from addons: gdUnit4 (202), gut (10); look one up with docs_class". The base classes that tests extend
(`GutTest`, `GdUnitTestSuite`) are not named either: the folder names show which test framework is installed,
`test_run` states the convention when a run finds no tests, the companion skill documents both, and `docs_class`
reads either one.

### 8.2 Editor and file system

| Tool | What it does | M | Kind | Needs |
|---|---|---|---|---|
| `editor_rescan` | Sync the editor with the disk (§9.3): scan, reimport, reload open scripts; wait until done | 1 | W (idempotent) | E (C: `--headless --import`) |
| `editor_launch` | Launch the editor for the project and wait until the addon connects; with a window unless `headless`; refuses to start a second editor while one is registered in the discovery file | 2 | W | C |
| `editor_screenshot` | Render of the 3D scene open in the editor from the editor camera or from given views (§8.9), without the grid and gizmos; says when the editor's preview sun and sky light it. 2D scenes and UI are checked with `game_screenshot`; a capture of the whole editor window is not planned yet | 2 | R | E |
| `editor_select` | Select nodes or files so the user sees what the agent is talking about | 3 | W (harmless) | E |
| `editor_run_script` | Run a GDScript snippet in the editor context — an escape hatch, disabled by default | 3 | D | E |
| `filesystem_move` / `filesystem_delete` | Move and delete files together with their `.uid`/`.import` files, checking dependencies | 4 | D | E |

### 8.3 Scenes

| Tool | What it does | M | Kind | Needs |
|---|---|---|---|---|
| `scene_create` | New scene: path, root type (or inherit another scene), name; open it in the editor | 1 | W | E |
| `scene_open` / `scene_close` | Open or close a scene in the editor | 1 / 3 | W | E |
| `scene_save` | Save the current scene, a given scene, or all scenes | 1 | W | E |
| `scene_get_tree` | Node tree: types, scripts, instances, groups; depth limit, filter; compact text | 1 | R | E (C — M4) |
| `scene_batch_edit` | A list of operations as one Undo action: each is a node or signal tool (`node_add`, `node_delete`, `node_set_properties`, `node_reparent`, `node_duplicate`, `signal_connect`, `signal_disconnect`) with its parameters; later operations see the results of earlier ones. On the first error or rejected property everything rolls back and the response names the failed operation | 2 | W | E |

### 8.4 Nodes and signals

| Tool | What it does | M | Kind | Needs |
|---|---|---|---|---|
| `node_add` | Add a node by engine class, `class_name` or `res://….tscn` (instance); set properties right away | 1 | W | E |
| `node_delete` | Delete nodes (batch) | 1 | D | E |
| `node_get_properties` | Node properties; by default only those that differ from defaults; types and enum options | 1 | R | E |
| `node_set_properties` | Change properties, including `script` and resources by `res://` path; batch, with a per-property report | 1 | W | E |
| `node_reparent` | Move, rename, reorder; 3D nodes keep their world transform, and `NodePath` properties that pointed at the moved nodes are updated | 2 | W | E |
| `node_duplicate` | Duplicate a node with its children, groups, scripts and signal connections; name, parent and properties for the copy | 2 | W | E |
| `node_find` | Search by name (substring or `*` pattern), type (subclasses included), group, script | 2 | R | E |
| `signal_list` / `signal_connect` / `signal_disconnect` | Persistent connections (`CONNECT_PERSIST`) in a scene; checks that the target method exists and takes the signal's arguments, and otherwise names the function to add | 2 | R/W | E |
| `node_set_groups` | Add or remove groups | 3 | W | E |
| `node_call_method` | Call a node method in the editor (e.g. `look_at`) | 3 | D | E |

### 8.5 Resources

| Tool | What it does | M | Kind | Needs |
|---|---|---|---|---|
| `resource_create` | Create a `.tres` (material, environment, theme, curve, custom `Resource`) with properties | 3 | W | E |
| `resource_get` | Type, properties, dependencies | 3 | R | E |
| `resource_set_properties` | Change resource properties | 3 | W | E |
| `resource_find_usages` | Who references a file (reverse dependencies) | 4 | R | E |

`resource_create` writes the new `.tres` file at once and never replaces an existing one. `resource_set_properties`
changes the resource that the editor holds, as one Undo step, and saves the file right away, so the game, tests run
through the CLI and every scene that uses it see the change. An Undo in the editor marks the resource as changed
again, and the editor writes it with the next save. Imported files such as textures and models are refused: Godot
rebuilds them from their source files. Scenes and scripts are refused too and pointed to their own tools. Resources
and nodes of the project's own classes are created the way the editor creates them: the native base class with the
script attached, because inside the editor `can_instantiate()` is false for scripts without `@tool`.

### 8.6 Scripts and documentation

| Tool | What it does | M | Kind | Needs |
|---|---|---|---|---|
| `script_validate` | GDScript analyzer errors and warnings for given files or the whole project | 2 | R | E (LSP) / C |
| `docs_class` | Reference for an engine class or your own `class_name`: inheritance, properties, method signatures, signals, constants; for a single member — the full description | 2 | R | C |
| `docs_search` | Search across classes and members ("raycast", "tween", "character controller") | 2 | R | C |

The engine docs come from `godot --headless --dump-extension-api-with-docs` of the installed engine: one JSON file
(about 12 MB, 1 s) with every class, built-in type and global function and the descriptions the editor shows in its
help. It is cached per engine version in the user cache folder (`~/Library/Caches/godot-mcp-tool` on macOS,
`$XDG_CACHE_HOME` on Linux, `%LOCALAPPDATA%` on Windows, or `GODOT_MCP_CACHE_DIR`). `--doctool <folder>` is not
enough: it writes only the structure of the API and takes the descriptions from XML files that already lie in the
folder, which exist only in the engine source tree. The project's own classes come from their `##` doc comments
through `godot --path <project> --doctool <folder> --gdscript-docs res://` (under a second), generated into
`.godot/godot_mcp_tool/class_docs/` again whenever a `.gd` file of the project changes. Descriptions are converted
from BBCode to Markdown, keeping the GDScript version of code examples. A class overview lists each member with the
first sentence of its description and stays under about 6,000 tokens: for large classes the summaries are shortened
or left out, and the longest sections are cut with a pointer to `docs_search`. Setters and getters of properties are
left out of the overview, as in the editor's help. Not covered yet: the `@GDScript` page (annotations such as
`@export_range`, and functions such as `preload`) and the default values of engine properties, which the API dump
doesn't carry.

### 8.7 Running the game and runtime

| Tool | What it does | M | Kind | Needs |
|---|---|---|---|---|
| `game_run` | Run the main, current or a given scene; wait until ready; return the first errors. Options: `duration_ms` (run N ms, then stop), `fixed_fps` (deterministic mode) | 1 | W | E (C — as a process) |
| `game_stop` | Stop the game | 1 | W | E/C |
| `game_get_output` | Logs and errors with stack traces after a cursor (only new entries), level filter, line limit | 1 | R | E/C |
| `game_screenshot` | Screenshot of the game viewport: scale, format; in 3D, optionally renders from extra cameras without touching the active one (§8.9) | 2 | R | G |
| `game_input` | A sequence of steps: actions, keys, mouse motion and clicks, text, pauses; optionally a screenshot at the end | 2 | W | G |
| `game_wait` | Wait for render frames, physics frames, milliseconds or a condition (`Expression`), with a timeout | 2 | R | G |
| `game_get_tree` | The runtime node tree | 2 | R | G |
| `game_get_properties` / `game_set_properties` | Like the remote inspector | 2 | R/W | G |
| `game_pause` / `game_step` | Freeze the game and advance it by N physics frames (§9.10) | 3 | W | G |
| `game_continue` | Resume a game paused on an error (§9.7) | 2 | W | G |
| `game_eval` | Evaluate an `Expression` in a node's context — disabled by default | 3 | D | G |
| `game_performance` | FPS, frame and physics time, memory, objects, draw calls, primitives; sampled over N frames | 3 | R | G |

Example `game_input` steps:

```json
{
  "steps": [
    {"action": "move_forward", "physics_frames": 60},
    {"action": "jump"},
    {"wait_ms": 300},
    {"mouse_motion": [120, 0]},
    {"click": [640, 360]}
  ],
  "screenshot": true
}
```

Mouse positions are given in game-viewport space — as seen in `game_screenshot`; the runtime agent converts them to
window coordinates (§9.9). `mouse_motion` is a relative movement, e.g. for mouse look.

### 8.8 Tests, build, debugging

| Tool | What it does | M | Kind | Needs |
|---|---|---|---|---|
| `test_run` | GUT or gdUnit4 tests (detected in `addons/`): folders, scripts, tests by name (GUT); JUnit report → summary, failed tests with `file:line`, test scripts that failed to load | 3 | W (runs project code) | C |
| `export_project` | Export by preset (`--export-release` / `--export-debug`), checking export templates | 4 | W | C |
| `debug_*` | Breakpoints, stack, variables — via the editor's DAP server (port 6006) | 4 | W | E |

`test_run` brings the project up to date first: the connected editor rescans it, otherwise
`godot --headless --import` runs, so the classes of new scripts are known. It then runs the framework's command line
in a separate Godot process, headless unless asked otherwise, and reads its JUnit report from a folder of its own in
`.godot/godot_mcp_tool/test_reports/`, removed after the run:
GUT through `-s res://addons/gut/gut_cmdln.gd -gexit -gjunit_xml_file=… -gdir=…/-gtest=…/-gunit_test_name=…` (with no
paths, `.gutconfig.json` decides when it exists); gdUnit4 through
`-s res://addons/gdUnit4/bin/GdUnitCmdTool.gd --ignoreHeadlessMode -c -rd … -a …`. Without paths, `res://test` and
`res://tests` run. GUT puts the failing line into the failure text ("at line 9"), gdUnit4 into the `message`
attribute ("FAILED: res://test/player_test.gd:9"); both are read. `SCRIPT ERROR: Parse Error` lines of the output name
test scripts that failed to load, whose tests are otherwise just missing from the report; the summary counts them next
to the outcomes ("all passed; 1 test script failed to load"), or says "No tests ran" when none loaded, so a run with
missing tests never reads as green. The editor's own errors about those scripts are left out of the new-error summary
(§9.6). gdUnit4 cannot pick single tests by name. Tests load scenes and resources from
disk, so unsaved changes in the editor are not seen.

### 8.9 3D tools

3D is the priority (§3). A single screenshot of a 3D scene is ambiguous, so we invest in seeing the scene from the
right angles and in structured spatial checks.

| Tool / capability | What it does | M | Kind | Needs |
|---|---|---|---|---|
| `views` option of `editor_screenshot` and `game_screenshot` | Render from preset angles (`front`, `back`, `left`, `right`, `top`, `iso`) framed on the whole scene or on a node's bounds, or from given viewpoints (`position`, `look_at`, `fov`); up to six views in one labelled contact sheet. Uses a temporary `Camera3D` in a `SubViewport` that shares the scene's `World3D`; the user's editor camera and the game's active camera stay untouched | 2 | R | E/G |
| `node_get_bounds` | Global AABB (center, size) of a 3D node and its subtree — for placement and scale checks | 2 | R | E/G |
| `asset_import_settings_get` / `asset_import_settings_set` | Import options of 3D models (glTF, FBX, `.blend`): scale, root type, collision generation, material extraction; then reimport | 4 | R/W | E |
| `navigation_bake` | Bake the `NavigationMesh` of a `NavigationRegion3D`, wait for `bake_finished`, report the result | 4 | W | E |
| `gridmap_set_cells` / `gridmap_get_cells` | `GridMap` (3D tiles) — only if evaluations show it's needed | 4 | R/W | E |
| `animation_*` | `AnimationPlayer` tracks and keys; basic `AnimationTree` state machines | 4 | W | E |

Materials, environments, primitive meshes and collision shapes need no dedicated tools: they are sub-resources
(`{"new": "StandardMaterial3D", "albedo_color": "#c04020"}`, `{"new": "BoxShape3D", "size": [1, 2, 1]}`) handled by
the codec (§9.1). For quick level blockouts the server instructions recommend CSG nodes (`CSGBox3D`,
`CSGCombiner3D`, …). Authors of other MCP servers report that animation and complex scenes are where models struggle
most — so verification from several angles matters.

### 8.10 MCP resources, prompts and the companion skill

- **Resources** are read-only views over tools and show the same text as the tool calls: `godot://project`
  (`project_info`), `godot://scene/{+path}` (`scene_get_tree` of a scene file, such as
  `godot://scene/levels/arena.tscn`), `godot://docs/{class}` (`docs_class`) and `godot://logs/last-run` (the output of
  the last run from its start, up to 200 entries). The resource list names the project, the last-run log and every
  scene of the project (addons and dot folders skipped), because the `@` menu of Claude Code offers the listed
  resources, such as `@godot:godot://scene/main.tscn`; class references are read through the template. Resources stay
  in the read-only mode.
- **Prompts** become `/mcp__godot__<name>` commands in Claude Code, which splits their arguments at spaces, so every
  argument is one word:
  - `fix_last_run` reads the errors of the last run (up to 50) and hands them over with the steps to fix them:
    `script_validate`, then `game_run` again until a run has no errors;
  - `playtest [scene]` asks to playtest the game or one scene without changing the project: the input map and the
    scene tree, `game_run`, screenshots from several views, input, waits and property reads, pause and step,
    `game_performance`, then a report of what works and what does not.

  Prompts are left out in the read-only mode: both need tools that the mode turns off.
- **Skill** `plugin/skills/godot/`: `SKILL.md` (the "edit → validate → run → observe" loop with the tools and the
  rules that prevent most mistakes) and the files it links, read on demand: `gdscript.md` (GDScript 4 idioms and the
  Godot 3 code to avoid), `3d.md` (axes, units, a `CharacterBody3D` controller, cameras, collisions, light) and
  `testing.md` (GUT tests and `test_run`). Claude Code truncates server instructions at 4,096 characters, so the longer
  guidance lives here. The folder has the layout of a Claude Code plugin (`skills/<name>/SKILL.md`); milestone 5 adds
  the manifest and `.mcp.json`. A unit test checks the frontmatter, the links, that `SKILL.md` stays under 500 lines,
  that every tool it names exists and that GDScript samples are indented with tabs; the samples were compiled with
  `--check-only` and the sample GUT test run against a scratch project.

### 8.11 Server instructions

MCP lets a server pass instructions to the client. Claude Code loads them at startup together with the tool names
and truncates them at 4,096 characters, so the text must stay short. Draft:

```text
Connected to Godot <version>, project "<name>" (3D). Indentation: <tabs | N spaces> — never mix.
- Use Godot 4 APIs only: await, @export, @onready, Node3D, CharacterBody3D, signal.connect(callable).
- While the editor is connected, never edit .tscn/.tres as text: use scene_*/node_*/resource_* tools.
- After changing .gd files: call script_validate, then game_run and game_get_output.
- When unsure about an engine API, call docs_class before writing code.
- Check 3D results from more than one camera angle and with node_get_bounds, not from a single screenshot.
- If a result reports new errors, read them with game_get_output before continuing.
- Call scene_save when a logical change is complete.
```

### 8.12 Modes and Claude Code specifics

- Claude Code's tool search is on by default: only tool names are loaded at startup. The core loop
  (`godot_status`, `scene_get_tree`, `node_add`, `node_set_properties`, `game_run`, `game_get_output`,
  `script_validate`, `docs_class`) is marked `_meta["anthropic/alwaysLoad"]`, so it is available immediately.
- `GODOT_MCP_READ_ONLY=1` exposes read-only tools only (those annotated `readOnlyHint`); `GODOT_MCP_DISABLE=tool1,tool2`
  turns off individual tools. `godot_status` names the modes that differ from the defaults, unknown names in
  `GODOT_MCP_DISABLE` included, and the server instructions say when the server is read-only.
- Dangerous tools (`editor_run_script`, `game_eval`, `node_call_method`, later `filesystem_delete`) need two switches:
  `GODOT_MCP_UNSAFE=1` registers them in the server, and the editor runs them only when the project allows them in
  Project → Tools → Godot MCP Tool → Allow Unsafe Tools. That switch is kept in the editor's project metadata
  (`.godot/editor/project_metadata.cfg`), so it belongs to one user and one project and never reaches version control;
  the dock of milestone 5 will show it too. `_meta["anthropic/requiresUserInteraction"]` makes Claude Code ask for
  confirmation on every call. `editor_run_script` wraps the code as the body of `func run(scene: Node) -> Variant` in an
  in-memory `@tool` script and reports compile and runtime errors with the lines of the code; `node_call_method`
  records the property changes of the node as one Undo step; `game_eval` evaluates an `Expression` on a node of the
  running game.
- No tool profiles for other clients (§3).
- Claude Code runs the tool calls of one message at the same time (seen in the milestone 2 live run): a
  `game_get_properties` sent together with `game_input` read the state before the input. The server instructions
  tell the agent to read game state in a later message than the `game_input` or `game_wait` it depends on.

### 8.13 Compact output example (`scene_get_tree`)

```text
res://levels/arena.tscn  (unsaved changes)
Arena: Node3D  [script res://levels/arena.gd]
├─ Player: CharacterBody3D  [instance res://player/player.tscn]  groups=player
│  ├─ Mesh: MeshInstance3D  mesh=CapsuleMesh
│  ├─ Collision: CollisionShape3D  shape=CapsuleShape3D
│  └─ Camera: Camera3D  current=true
├─ Floor: CSGBox3D  size=Vector3(40, 1, 40)  use_collision=true
├─ Sun: DirectionalLight3D  shadow_enabled=true
└─ Environment: WorldEnvironment  environment=res://levels/arena_env.tres
⚠ Since the last call: 1 new error in the game — see game_get_output
```

---

## 9. Key technical decisions and pitfalls

### 9.1 Variant codec and write verification

The most important part of the addon: it decides whether the agent can set properties "the way it thinks".

**Input.** Values are converted according to the **type of the target property** (from `get_property_list()`:
`type`, `hint`, `hint_string`):

- numbers, strings, bools → `int` / `float` / `String` / `bool`;
- arrays and objects → math types: `[x, y]` or `{"x":…, "y":…}` → `Vector2`/`Vector2i`, `[x, y, z]` → `Vector3`,
  `[r, g, b, a]` → `Color`;
- strings in Godot syntax: `"Vector3(1, 2, 3)"`, `"Quaternion(…)"`, `"Transform3D(…)"` → `str_to_var()`; a result
  of type `Object` is rejected, so we never deserialize objects;
- colors: `"#ff8800"`, `"red"`;
- resources: `"res://…"` or `"uid://…"` → `load()` with a type check against the property hint (a `mesh` must be a
  `Mesh`);
- a new embedded sub-resource: `{"new": "BoxShape3D", "size": [1, 2, 1]}`,
  `{"new": "StandardMaterial3D", "albedo_color": "#c04020"}` — the everyday case for `CollisionShape3D.shape`,
  `MeshInstance3D.mesh` and materials;
- typed collections `Array[T]` and `Dictionary[K, V]` are created with the right element types — otherwise the
  assignment silently doesn't happen (that's how godot-ai lost writes);
- enums and flags by name (`"SHADOW_CASTING_SETTING_OFF"` or `"Off"`) via `hint_string`; flags as an array of names;
- `NodePath` as a string; `null` resets to the default value.

**Write verification.** After a property is set, it is read back and compared with the expected value. A mismatch
goes into the report as "not applied", with a reason. This catches setters that reject a value and properties that
the engine recomputes.

**Output.**

- math types compactly via `var_to_str()`: `Vector3(10, 0, 20)`;
- resources as a `res://…` path, or `<BoxShape3D size=Vector3(1, 2, 1)>` for embedded ones;
- objects as `<Node path>`;
- long arrays are truncated: `PackedVector3Array[1200] (truncated)`;
- properties equal to their default are hidden by default (`ClassDB.class_get_property_default_value`).

**Errors** are reported per property: "no such property" plus similar names; "expected `Mesh`, got `Texture2D`", and
so on. In regular tools one failure doesn't cancel the other properties; in `scene_batch_edit` it rolls back the
whole batch.

### 9.2 `owner`, Undo/Redo, custom classes, saving

- New nodes get `owner` = the scene root, otherwise they aren't saved. For a scene instance only its root gets the
  `owner`; nodes inside the instance are left alone.
- Nodes of custom classes (`class_name`) are created through their script, not through `ClassDB`, which doesn't know
  about them.
- Every command is a single `EditorUndoRedoManager` action with a clear name ("MCP: Add Crate"): `add_do_method` /
  `add_undo_method`, `add_do_reference` for created nodes, `add_do_property` / `add_undo_property` for properties.
  We don't build our own snapshot-based undo (as Godlink did): with it, Ctrl+Z in the editor can't revert the
  agent's changes.
- Commands build their do and undo steps as a change set first. A single tool records it as one action and lets
  the history execute it. `scene_batch_edit` applies each operation's change set at once, so the next operation sees
  its result, and records all of them at the end with `commit_action(false)`, which registers an action without
  executing it again; the undo steps are recorded in reverse order of the operations, because the history runs them
  in the order they were added. When an operation fails, the applied change sets are undone directly in reverse
  order, nodes they created are freed, and nothing reaches the history.
- Moving a node out of its parent clears the owners of the moved nodes, so `node_reparent` sets them again, as the
  editor does. `node_duplicate` sets the owners of the copies itself, because `Node.duplicate()` leaves them empty.
- Saving is explicit (`scene_save` or `save: true`), so the user can review and revert changes.

### 9.3 Source of truth: editor or disk

The rule:

- **scripts** (`.gd`, `.gdshader`) — the disk is the source of truth: the agent edits files with Claude Code's tools;
- **scenes and resources** (`.tscn`, `.tres`) — while the editor is connected, the editor is the source of truth:
  changes go only through MCP tools.

**Pitfall (verified in the engine source).** Before running the game the editor saves everything
(`run/auto_save/save_before_running` = `true`), and saving a scene calls `ScriptEditorPlugin::save_external_data()` →
`save_all_scripts()`. That method writes **unsaved script editor tabs to disk without comparing them with the
disk**. If the user started editing a script in Godot without saving, and the agent changed the same file meanwhile,
the agent's change is silently overwritten. That is exactly how `scene_save` in godot-ai overwrote scripts.

What we do:

- before `game_run`, `scene_save` and `scene_open` the addon syncs the editor with the disk:
  `EditorFileSystem.update_file()` / `scan_sources()` for changed files and `ScriptEditor.reload_open_files()` for
  open tabs;
- if a file is in `ScriptEditor.get_unsaved_files()` and has also changed on disk since the last sync, we refuse to
  save or run and return `CONFLICT` with the list of files: the user resolves it in the editor;
- we recommend enabling `text_editor/behavior/files/auto_reload_scripts_on_external_change`, so open scripts without
  unsaved changes reload without a dialog; `godot_status` warns when it is off;
- UIDs (Godot 4.4+): a new script gets its `.uid` file only after a scan, so a new file can be referenced only after
  a sync. Files must be moved together with their `.uid`/`.import` files (`filesystem_move`).

How it is implemented (milestone 1): the addon relies on the engine's own check. `ScriptEditor.reload_open_files()`
compares each open tab's last known modification time with the disk; tabs without unsaved changes reload silently
(auto-reload is on by default in 4.8), and tabs with unsaved changes raise the "Files have been modified outside
Godot" dialog. The addon looks for that dialog right after the call and turns it into `CONFLICT` with the file
paths; the dialog stays open, so the user decides which version to keep. When there is no conflict, the response
lists the unsaved script tabs that the save writes to disk, so the agent knows to re-read them. File times have
one-second resolution, so a disk change within the same second as the editor's last load goes unnoticed.
`scene_open` needs no check: opening a scene saves nothing.

### 9.4 Unopened scenes, parallel work, modal dialogs

- While the editor is connected, all scene edits go **through the editor**: the scene is opened
  (`open_scene_from_path`), so changes are visible and undoable. Editing a `PackedScene` in the background, bypassing
  the editor, happens only in headless mode (milestone 4).
- A rule for the agent (in the server instructions): don't edit `.tscn`/`.tres` as text while the editor is
  connected.
- Modal editor dialogs (unsaved changes, file conflicts, import) get in the way of commands — a frequent complaint
  about Godot MCP Pro. If an exclusive dialog is open, commands that depend on it return `EDITOR_BUSY` with a hint
  about which dialog to close.

### 9.5 Main thread and latency

- All editor API calls run on the main thread; the bridge is polled in the plugin's `_process`, and commands run with
  a per-frame time budget.
- An unfocused editor sleeps between frames: `interface/editor/timers/unfocused_low_processor_mode_sleep_usec` is
  100,000 µs by default (before 4.8 the setting had no `timers/` segment). Spike 1 measured exactly that: a bridge
  round trip takes 6.8 ms with a focused editor and 100 ms when the Godot window is in the background — the usual
  situation while you work in Claude Code.
- While a client is active, the addon keeps the editor responsive: it sets `OS.low_processor_usage_mode_sleep_usec` to
  the focused value in `_process` (the editor resets it only on focus changes) and restores the editor's own value
  after a quiet period, so an idle editor costs no extra power. Spike 1: 6.8 ms round trips with the window in the
  background.
- Heavy handlers (a large tree, bulk edits) are split with `await get_tree().process_frame`.

### 9.6 Logs and errors

Errors come from three places, and we capture all three:

1. **The game** — a `Logger` (4.5+) in the runtime agent: `_log_message(message, error)` and
   `_log_error(function, file, line, code, rationale, editor_notify, error_type, script_backtraces)`.
   It is called from any thread → a `Mutex` and a ring buffer; inside the logger, `print`/`push_error` must not be
   called (recursion). Batches are sent once per frame to stay within the debugger limits
   (`network/limits/debugger/max_queued_messages` and related settings).
2. **The editor** — the addon's own `Logger`: parse errors when scripts reload, import and shader errors.
3. **Game startup before the agent** — whatever happened before our autoload loaded, or when the game crashed
   immediately. The source is the game's log file `user://logs/godot.log` (file logging is on by default on desktop:
   `debug/file_logging/enable_file_logging.pc = true`); the addon writes its absolute path into the discovery file.
   A game launched as a process also has stdout/stderr.

Every entry has a monotonic `seq`. `game_get_output` returns the entries after a cursor, so a repeated call returns
only new ones, and the server uses the same cursors to add the new-error summary to every response.
The addon sends the log status together with the response to each command, so an error printed after a response
reaches the agent with the next call. A result can cover errors: `script_validate` reports the current state of the
scripts it checked, so it leaves the editor's parse errors and failed loads of those scripts out of the summary —
they repeat its report or belong to an older version of the file. `test_run` does the same for the test scripts it
reports as failing to load; since its tests run outside the bridge, it pings the connected editor after the run, so
the errors the editor printed meanwhile arrive with its result rather than with the next call.

`editor_rescan` returns only after the editor has applied the scan, so the parse errors of the scripts the editor
loads meanwhile come with its result. An editor with a window loads every script that a scan found new or changed
while it applies the scan, to update the script documentation (`_update_script_documentation`). When there is more
than one such script, it shows a progress dialog for this work, and every update of the dialog runs a whole main
loop iteration inside the apply: `process_frame` fires and the addon keeps answering requests before the scripts
are loaded. So the addon does not count frames; it waits for `EditorFileSystem.sources_changed`, which the editor
emits at the end of every applied scan. More than one script is common, because a rescan saves the file system
cache before its new file tree replaces the old one, and the next rescan loads the scripts the previous one picked
up again. This is the delay the milestone 3 live run saw with a new test script in a new folder: the folder plays no
part, but a rescan right after one that picked up another script loads both and shows the dialog. A headless editor
loads no scripts while it applies a scan and prints no parse errors for a new broken script.
We don't parse the editor's Debugger tab or Output panel: that is brittle and depends on the editor's UI layout.

Display rules, from spike 3: the message is `rationale` when it is not empty, otherwise `code` (engine errors keep the
real text in `rationale`); the location is the first script backtrace frame when there is one, otherwise `file:line`
(for `push_error` and `push_warning`, `file:line` points into the engine's C++ code).

### 9.7 Game paused on error

On a script error the editor's debugger pauses the game by default — to the agent this looks like a hang. What we do:

- for runs started by the agent we add `--ignore-error-breaks` through the `EditorPlugin._run_scene` hook (it is
  called for every way of running from the editor); configurable;
- `godot_status` and `game_run` report the `paused_on_error` state with the error and its stack
  (the `EditorDebuggerSession.breaked` signal);
- `game_stop` always works, and `game_continue` resumes a paused game: `EditorDebuggerSession` has no `continue`
  method, but sending the raw debugger message `continue` works (spike 5). Custom captures keep working while the
  game is paused, so the runtime agent can still report the error, the stack and node state.

### 9.8 Screenshots and 3D renders

- In the game: wait for `RenderingServer.frame_post_draw`, then `get_viewport().get_texture().get_image()` (spike 2:
  3 ms, plus 17 ms for the PNG). On macOS a game started from the editor runs embedded in the Game view by default;
  capturing works the same. The image is scaled to the game view (`get_visible_rect()`), so that its pixels are the
  positions `game_input` clicks use: with the `canvas_items` stretch mode the window texture is larger than the view.
- In the editor, the image of `get_editor_viewport_3d(i)` includes the grid and the gizmos and goes stale while the 3D
  screen is hidden, so `editor_screenshot` renders from the editor camera's transform, field of view and projection
  with an extra camera instead, as below.
- Renders from extra cameras: a temporary `SubViewport` whose `world_3d` is the scene's world (`find_world_3d()`) plus
  a `Camera3D` with the requested transform; rendered once, then freed. The image has no gizmos. Spike 11:
  - in the editor, don't wait for `frame_post_draw`: an idle editor may not draw a frame for seconds (90 s in one run).
    Instead call `camera.force_update_transform()` and `RenderingServer.camera_set_transform(...)` (otherwise the
    first frame renders from the origin), then `RenderingServer.force_draw(false)`: 13–44 ms with the editor in the
    background;
  - the editor's preview sun and sky live in the same `World3D`, so a scene without its own lights looks lit in editor
    renders but dark in the running game. The result of an editor render says so when the scene has no
    `DirectionalLight3D` or `WorldEnvironment` of its own, and the final look is checked with `game_screenshot`;
  - each view is labelled by a `Label` inside its `SubViewport`. A `CanvasItem` draws itself through a deferred call,
    so the editor render waits for one `process_frame` before `force_draw`.
- Images are fitted to a given longest side (1280 px by default, 256–2560), PNG or JPEG, and written to
  `.godot/godot_mcp_tool/captures/` (the latest 100 are kept); the server returns the image as image content plus the
  file path. Several views go into a single contact sheet to save tokens: `ceil(sqrt(n))` columns of 16:9 cells,
  each rendered at its final size, so nothing is scaled down afterwards. The file is the image the model receives.
- A debugger message is capped at 8 MiB — in spike 2 a 7 MB message arrived and a 9 MB one was dropped without any
  error. One more reason to pass a path rather than bytes.
- `--headless` has no rendering, so screenshots are impossible there and the tool returns a clear error. A game
  launched as a process therefore gets a window by default (GoPeak's screenshots broke because of headless runs).

### 9.9 Input

- `Input.parse_input_event()` for keys, mouse and text; `Input.action_press/release` for actions. No OS permissions
  are needed — the events are created inside the engine.
- Mouse positions are converted from viewport space to window coordinates, taking the stretch mode into account
  (`canvas_items` / `viewport`) — otherwise clicks miss.
- Relative mouse motion (`InputEventMouseMotion.relative`) drives mouse look, including when the mouse is captured.
- Hold durations are given in physics frames or milliseconds: press, wait, release.
- Devices: an event of an action matches only events from its own device unless its device is "all devices" (-1).
  `input_map_set` stores every event for all devices, as the editor's Input Map does by default, so a gamepad
  button works on any gamepad; events that `game_input` injects keep the devices of real ones (16 for the keyboard,
  32 for the mouse), so they match both kinds of actions.

### 9.10 Deterministic playtesting

- `game_run({fixed_fps: 60})` → `--fixed-fps 60`: the same `delta` every frame and reproducible runs.
- Waits and holds count **physics** frames, not only render frames — otherwise movement depends on the FPS
  (tugcantopaloglu/godot-mcp tripped on this).
- Pause and step (`game_pause`, `game_step`) pause the scene tree from the runtime agent. The spike of milestone 3
  compared this with the Game view's own "suspend / next frame": `SceneTree.set_suspend` is not available to scripts,
  only through the debugger messages `scene:suspend_changed` and `scene:next_frame`, and its next frame runs until the
  next rendered frame, which holds no fixed number of physics frames. The agent instead waits for the start of a
  physics tick, unpauses the tree, lets `physics_frame` fire N times and pauses it again: exactly N ticks of
  `_physics_process` and of the physics server. Nodes that the game sets to `PROCESS_MODE_ALWAYS` keep running, and
  resuming also ends a pause that the game set itself.
- With `fixed_fps` and no window the game runs as fast as it can (60 frames in 0.2 ms in the spike), so waits and
  holds in milliseconds mean little there; the tool descriptions point to physics frames.
- `game_performance` samples the `Performance` monitors and the frame times over N frames: average, 95th percentile
  and worst frame time, process and physics time, draw calls and primitives, memory, objects, nodes and orphan nodes,
  and the 3D physics load.

### 9.11 Response size and tokens

What matters in Claude Code (2.1.x):

- a warning when a response exceeds 10,000 tokens; the `MAX_MCP_OUTPUT_TOKENS` limit is 25,000 by default; text over
  the limit or longer than 50,000 characters is saved to a file and the model receives only the path;
- images count against the limit too; error text (`isError`) longer than ~11,000 characters is cut down to its first
  and last 5,000 characters;
- with tool search, only tool names and server instructions load at startup; instructions and descriptions of
  preloaded tools are truncated at 4,096 characters, other descriptions at 16,384.

Our rules:

- a typical response stays under ~2,000 tokens, with a hard ceiling of ~8,000;
- every read tool has limits (`max_depth`, `max_items`, `max_lines`, `cursor`) with conservative defaults; when output
  is truncated, the response says what was cut and how to get the rest;
- screenshots are fitted to 1280 px by default, and several views share one image;
- text first: we don't use `structuredContent` by default. According to the Agent SDK docs, when it is present the
  model receives the JSON instead of the text blocks; this is not confirmed for external stdio servers — a spike
  will check.

### 9.12 Connection lifecycle

Dropped and failed connections are the top complaint about almost every existing project. Our rules:

- no fixed ports: the editor picks the port (`TCPServer.listen(0, "127.0.0.1")`), so "port already in use" can't
  happen;
- a discovery file with the `pid`: if the process is dead, the file is stale; on a connection error the file is read
  again;
- the client connects strictly to `127.0.0.1`, not to `localhost` (which may resolve to `::1`; Godlink tripped on
  this);
- reconnection with growing delays when the editor restarts; a clear state in `godot_status`;
- several MCP server processes (several Claude Code windows) connect to one editor without conflicts — the addon
  serves every client.

### 9.13 Processes

- stdio hygiene: stdout of the server carries MCP only; the output of child Godot processes is always captured.
- Side-effect-free startup: an SDK client may start a short-lived copy of the process to check the protocol version,
  so we neither connect to the editor nor launch Godot at startup.
- Shutdown: when stdin closes and on SIGINT/SIGTERM (Claude Code stops a server with SIGINT, then SIGTERM after
  100 ms, then SIGKILL after another 400 ms). Games started by the server stop with it; an editor started via
  `editor_launch` is a detached process and keeps running. Its output goes to `.godot/godot_mcp_tool/editor.log`
  rather than to a pipe of the server, which would break once the server exits; the end of that log is shown when
  the editor stops before its plugin connects.
- Processes are started with `spawn`/`execFile` and an argument array, never through a shell (Coding-Solo had an RCE
  via shell injection in the project path).
- Long operations (tests, import, export) send progress notifications: Claude Code moves calls longer than 2 minutes
  to the background and aborts a call that has neither responded nor reported progress for 30 minutes.
- One server process per project. For several projects, add several entries to the MCP configuration.
- A headless editor ignores `SIGINT`; `SIGTERM` and `SIGKILL` stop it without `_exit_tree`, so its discovery file
  stays behind and is caught by the `pid` check (spike 1). Anything that stops editors uses `SIGTERM`/`SIGKILL`.

### 9.14 Versions and compatibility

- The primary target is a `master` build of the engine. We record the engine commit we test against in
  `docs/spikes.md`, update it deliberately and rerun the integration tests after every update; CI on 4.7 stable helps
  tell our bugs from engine regressions.
- The addon reports the Godot version; newer APIs are feature-detected with `has_method` (e.g.
  `EditorInterface.get_unsaved_scenes()` exists only since 4.7).
- The bridge protocol version is part of the handshake; on a mismatch the error explains how to update the addon.
- Version parsing handles custom builds: `4.8.beta.custom_build.679066724`.
- MCP specification 2026-07-28 is incompatible with earlier revisions, but SDK v2 negotiates the version and serves
  both new and old clients.

### 9.15 GDScript language server (LSP)

- It starts automatically with the editor (port `network/language_server/remote_port`, 6005 by default; `--lsp-port`
  overrides it). Up to 8 clients at once — it can be shared with VS Code.
- With two editors open, the second can't take the port. The addon cannot see the port it actually listens on: the
  engine consumes `--lsp-port` and leaves it out of `OS.get_cmdline_args()`, so the discovery file carries the editor
  setting. The server sets `GODOT_LSP_PORT` over it when given, and it recognizes a language server that belongs to
  another project by its `gdscript_client/changeWorkspace` notification and falls back to `--check-only`.
- `didOpen` runs the parser and the analyzer and publishes diagnostics with positions; since 4.8 the warning code is
  sent in the `code` field. Spike 4: diagnostics arrive 1–9 ms after `didOpen`, unsaved text is analyzed as sent,
  autoloads and `class_name` types resolve. The same problem can be reported twice, so results are deduplicated by
  position.
- Before asking the language server, `script_validate` rescans the project, so classes from new scripts are known.
- The language server parses every script of the project on its first `initialize` and logs each failure as an editor
  error; the addon leaves errors from `modules/gdscript/language_server/` out of the new-error summary, since
  `script_validate` reports them itself.
- `--check-only --script` is the fallback when the language server is not available: its exit code is always 0, so its
  output is parsed (`SCRIPT ERROR: …` followed by `at: … (res://…:line)`), duplicates on one line are dropped, and errors
  about autoload names are filtered out (spike 7; not seen again on 4.8). It finds errors but not warnings.

### 9.16 3D specifics

- Structured checks first, pictures second: positions, `node_get_bounds`, floor and raycast checks through properties
  or `game_eval`; screenshots confirm, they don't prove.
- Imported models arrive with arbitrary scale and orientation (glTF is Y-up, Blender units, FBX scale): check them
  with `node_get_bounds` and fix them in the import settings rather than by scaling nodes.
- `project_info` reports the renderer (Forward+, Mobile, Compatibility) and the 3D physics engine
  (`physics/3d/physics_engine`: GodotPhysics3D or Jolt) — both change what the agent should expect.
- Movement and physics are checked in physics frames: a `CharacterBody3D` is checked with `is_on_floor()` after a
  `game_wait` of a few physics frames.
- `game_performance` includes 3D counters (draw calls, primitives, video memory) to catch performance regressions
  early.

---

## 10. Security

- The bridge listens on **`127.0.0.1` only**. By default `TCPServer.listen()` listens on **all** interfaces (`"*"`),
  so we pass the address explicitly. In ee0pdt/Godot-MCP exactly this (all interfaces and no authentication) led to
  an RCE rated CVSS 9.6.
- A 128-bit random token in the discovery file inside `.godot/` (never committed). The token is required in the first
  message and compared in constant time.
- Raw TCP + NDJSON instead of HTTP/WebSocket: a web page can't open such a connection, and an HTTP request to this
  port is dropped as non-JSON. This closes browser-based attacks (CSRF, DNS rebinding).
- Path sandbox: every path must resolve inside `res://`. `..`, absolute paths and symlinks pointing outside the
  project are rejected (the addon's own development symlink is resolved explicitly).
- Processes run without a shell (§9.13).
- Dangerous capabilities (`editor_run_script`, `game_eval`, `node_call_method`, `filesystem_delete`,
  `export_project`) are off by default, marked with `destructiveHint` and confirmed on every call (§8.12).
- The runtime agent is active only with a debugger attached, i.e. never in exported release builds.
- No network access beyond localhost; no telemetry.
- In Claude Code, read-only tools can be allowed in advance in the permission rules; modifying tools ask for
  confirmation.
- Open-source hygiene: `SECURITY.md` with a reporting channel (milestone 5).

---

## 11. Stack and repository layout

### 11.1 Stack

| Component | Choice | Why |
|---|---|---|
| MCP server | TypeScript, Node.js ≥ 22 (26 installed) | the official SDK is the reference MCP implementation; `npx` distribution; good process and socket handling |
| MCP SDK | `@modelcontextprotocol/server` v2 (2.3.1 as of 2026-10-05) | v2 is the recommended stable line; it implements specification 2026-07-28 and serves clients on older revisions; v1 (`@modelcontextprotocol/sdk`) only gets fixes |
| Schemas | zod ≥ 4.2 (`import * as z from 'zod/v4'`) | required by SDK v2; zod 4.0–4.1 silently drop `.describe()`, zod 3 isn't supported |
| Server tests | vitest | fast unit and integration tests |
| Manual checks | MCP Inspector (`@modelcontextprotocol/inspector` 2.x, Node ≥ 22.19) | calling tools without Claude Code |
| Addon | GDScript with static typing | no compilation, runs on every platform; no GDExtension needed |
| Addon tests | GUT | simple CLI runs |
| Engine docs | `godot --dump-extension-api-with-docs` → JSON → index | exactly matches the installed build |
| CI | GitHub Actions | free for public repositories |

A sketch of a tool registration with SDK v2 (the exact API is checked during implementation):

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

function createServer(): McpServer {
  const server = new McpServer({ name: 'godot', version: '0.1.0' }, { instructions: buildInstructions() });

  server.registerTool(
    'node_add',
    {
      title: 'Add node',
      description: 'Add a node to a scene in the connected Godot editor (undoable with Ctrl+Z). …',
      inputSchema: z.object({
        scene: z.string().optional().describe('res:// path; defaults to the edited scene'),
        parent: z.string().default('.').describe('NodePath relative to the scene root'),
        type: z.string().describe('Engine class, class_name, or res://….tscn to instance'),
        name: z.string().optional(),
        properties: z.record(z.string(), z.unknown()).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: { 'anthropic/alwaysLoad': true },
    },
    async (args, ctx) => callEditor('node.add', args, ctx),
  );

  return server;
}

void serveStdio(createServer);
```

### 11.2 Repository layout

```text
godot-mcp-tool/
├── README.md
├── LICENSE                       MIT
├── CLAUDE.md                     rules for Claude Code: code style, TDD, commits
├── docs/
│   ├── DEVELOPMENT_PLAN.md       ← this document
│   ├── setup.md                  user guide: how to connect (milestone 5)
│   ├── usage.md                  user guide: how to use (milestone 5)
│   ├── protocol.md               bridge protocol (milestone 1)
│   ├── tools.md                  tool reference (generated from the schemas, milestone 5)
│   ├── spikes.md                 spike results and the pinned engine commit (milestone 0)
│   └── evals/                    evaluation tasks (milestone 5)
├── server/                       MCP server (TypeScript)
│   ├── src/
│   │   ├── index.ts              entry point (stdio)
│   │   ├── config.ts             project and Godot binary discovery, environment variables
│   │   ├── server.ts             server creation, tool registration
│   │   ├── bridge/               bridge client: discovery, NDJSON, JSON-RPC, reconnects
│   │   ├── godot/                Godot CLI runs, output parsing, process management
│   │   ├── lsp/                  LSP client for the GDScript language server
│   │   ├── docs/                 docs index built from the API dump of the engine
│   │   ├── logs/                 log store with cursors, new-error summary
│   │   ├── tools/                one file per area: project, editor, scene, node, game, docs, view3d, …
│   │   ├── resources/            MCP resources
│   │   ├── prompts/              MCP prompts
│   │   └── util/                 errors, truncation, pagination, images
│   └── test/
├── addon/
│   └── addons/godot_mcp_tool/    copied (or symlinked) into the game project
│       ├── plugin.cfg
│       ├── plugin.gd             EditorPlugin: bridge, autoload, debugger plugin
│       ├── bridge/               TCP server, connections, JSON-RPC, discovery
│       ├── commands/             handlers: project, editor, scene, node, resource, game, view3d, …
│       ├── codec/                Variant codec
│       ├── debugger/             EditorDebuggerPlugin
│       ├── runtime/              autoload GodotMcpRuntime and its commands
│       └── logging/              Logger subclass
├── plugin/                       Claude Code plugin (manifest and .mcp.json in milestone 5)
│   └── skills/godot/             the companion skill: SKILL.md, gdscript.md, 3d.md, testing.md
├── test-project/                 3D Godot project for integration tests (addon symlinked)
└── scripts/                      dev scripts: install GUT and gdUnit4, run the addon tests, release
```

Naming: npm package `godot-mcp-tool`; the addon folder and the settings section are `godot_mcp_tool`; the autoload is
`GodotMcpRuntime`. The names avoid clashes with other Godot MCP addons (almost all of them use `addons/godot_mcp/`)
and with game code.

### 11.3 Engineering practices

The rules live in [CLAUDE.md](../CLAUDE.md); this is how they shape the code.

- **No comments.** Names carry the meaning. Tool descriptions and `.describe()` texts are not comments: they are the
  interface the model reads, so they stay and get the same care as code.
- **TDD.** Every change starts with a failing test: vitest in the server, GUT in the addon, integration tests against
  a real editor for code that needs `EditorInterface`. Spikes (milestone 0) are throwaway; whatever survives them is
  rewritten test-first.
- **OOP and SOLID where they help:**
  - each MCP tool is a small unit with one job behind a common tool contract; new tools are added by registering
    them, without editing a central switch (single responsibility, open/closed);
  - tools depend on abstractions — `EditorBridge`, `GodotCli`, `LanguageServerClient`, `DocsIndex` — passed in from
    outside, which is what lets unit tests run against fakes (dependency inversion);
  - in the addon, each bridge method is a command class with the same `execute` contract, and the Variant codec is a
    set of per-type converters, so a new type means a new converter rather than a longer `match`;
  - small pure helpers (formatting, truncation, version parsing) stay plain functions.
- **Addon classes stay out of the game's global namespace:** they are loaded through `preload` constants instead of
  `class_name`, so they can't clash with classes in the game.
- **Strict typing:** TypeScript in `strict` mode, GDScript with static types everywhere.

---

## 12. Milestones

Every milestone has a task list and a **done criterion**: a scenario that passes in Claude Code without manual steps.

### Milestone 0 — Skeleton and spikes

- [x] `git init`, `.gitignore`, `README.md`, `LICENSE` (MIT), `.editorconfig`. The public GitHub repository is
      created when you say so.
- [x] `server/`: TypeScript project in strict mode, build, linter, vitest; a stdio server with one tool,
      `godot_status` (project path, binary, version via `godot --version`), written test-first.
- [x] `addon/`: `plugin.cfg`, `plugin.gd` — a TCP server on 127.0.0.1, the discovery file, `hello`/`ping`.
- [x] `test-project/`: a minimal 3D project with the addon (symlink) and GUT for the addon's tests.
- [x] Checked over stdio with MCP Inspector; `.mcp.json` at the repository root connects Claude Code to
      `test-project/`. The check from a Claude Code session itself is still to do.
- [ ] Spikes — small prototypes; findings go to `docs/spikes.md` together with the pinned engine commit. Done: 1–7 and
      9–11. Left: 8, which needs a Claude Code session with the server:
  1. `TCPServer.listen(0, "127.0.0.1")` inside an `EditorPlugin`: ephemeral port, polling in `_process`, latency with
     an unfocused window, several clients.
  2. The `EngineDebugger` ⇄ `EditorDebuggerPlugin` channel: round trip, screenshot transfer, several sessions, a game
     embedded in the editor (Game view).
  3. `Logger` in the game and in the editor: which messages arrive (`print`, `push_error`, script and shader errors),
     whether backtraces are present, what ends up only in the log file.
  4. LSP client: `initialize` → `didOpen` → `publishDiagnostics` on 4.7 and 4.8.
  5. `_run_scene` + `--ignore-error-breaks`; can the game be resumed after pausing on an error.
  6. `godot --headless --editor --path …`: do the addon and the bridge start (for CI and windowless work).
  7. `--check-only --script`: does the analyzer see autoloads and `class_name` types.
  8. How Claude Code passes text, `structuredContent` and images from a tool result to the model.
  9. The overwrite scenario from §9.3: reproduce it and check the protection via `reload_open_files()` /
     `get_unsaved_files()`.
  10. The addon symlinked into a separate game project: does the editor see it, do the autoload and imports work.
  11. Rendering from an extra camera in the editor and in the game: shared `World3D`, preview lighting, cost.

**Done when:** Claude Code sees the `godot` server; `godot_status` answers "editor connected, Godot 4.8.beta…";
the spike findings are written down and the plan is adjusted.

### Milestone 1 — MVP "editor under control"

Server:

- [x] Bridge client: discovery, handshake, lazy connect, reconnects, timeouts, errors turned into hints; clean exit
      when stdin closes.
- [x] Log store with cursors; the new-error summary in every response; formatters; size limits.
- [x] Tools: `godot_status`, `project_info`, `project_settings_get/set`, `editor_rescan`, `scene_create`,
      `scene_open`, `scene_save`, `scene_get_tree`, `node_add`, `node_delete`, `node_get_properties`,
      `node_set_properties`, `game_run`, `game_stop`, `game_get_output`.
- [x] Server instructions v1 (§8.11), `alwaysLoad` for the core.
- [x] `game_run` without the editor: a `godot --path …` process with a window. The runtime agent writes structured
      output to `.godot/godot_mcp_tool/local_game.ndjson`; the process output is kept for games that exit early.
      `GODOT_MCP_HEADLESS=1` runs such games without a window (CI, tests).

Addon:

- [x] Command dispatcher; several clients.
- [ ] A per-frame time budget for the dispatcher: not needed so far, because requests are handled as they arrive and
      long commands wait between frames. Revisit with heavier commands.
- [x] Variant codec v1 (numbers, strings, vectors, colors, resources by path, `{"new": …}` sub-resources, enums,
      `NodePath`, `Array[T]`) and read-back verification.
- [x] Scene and node commands through `EditorUndoRedoManager` with the correct `owner`.
- [x] Sync with the disk and conflict detection before saving and running (§9.3).
- [x] A minimal runtime agent: `ready` and logs via `Logger`; `Logger` in the editor. The agent is registered as the
      first autoload, `GodotMcpRuntime`.
- [ ] The game log file path in the discovery file: not needed so far, since runs without the editor write structured
      output and early failures come from the process output.

Tests come first for every task (TDD, §11.3): unit (TS with a fake bridge; GDScript for the codec), contract tests,
an integration happy path.

**Done when** this passes in Claude Code: "Create `res://levels/arena.tscn` (Node3D) with a 20×20 floor (a
`CSGBox3D` with collision), a `DirectionalLight3D`, a `WorldEnvironment` and a `Camera3D` looking at the center;
make it the main scene, run it and show the output." Every change can be undone with Ctrl+Z in the editor.
A deliberate script error shows up in `game_get_output` with file, line and stack, and its summary arrives in the
very next tool response.

Status: done. The scenario passes as the automated acceptance test `server/test/integration/mvpScenario.test.ts`
against a headless editor, Ctrl+Z included, and it passed in a live Claude Code session on 2026-10-22 (spike 8).

### Milestone 2 — "Eyes and hands"

- [x] Runtime inspection: `game_get_tree` (with the nodes created at runtime), `game_get_properties` (getters without
      arguments such as `is_on_floor()` included), `game_set_properties`, `game_wait`. They travel over a request
      channel from the editor to the game: `mcp:request` / `mcp:response` debugger messages, answered by game-side
      commands that the runtime agent loads only when a debugger is attached.
- [x] `game_input`: steps that tap or hold input actions and keys for physics frames or milliseconds, move and click
      the mouse in game-view pixels, type text and wait. Actions go in as `InputEventAction`, so both polling and
      `_input` see them; held input is released at the end unless asked otherwise.
- [x] `input_map_get` / `input_map_set`, moved here from milestone 3 for the scenario below.
- [x] `game_screenshot`: the game window with its UI, scaled to the game view so that its pixels are the positions
      `game_input` clicks use. `game_input` takes one right after its last step with `screenshot: true`.
- [x] 3D views: the `views` option of both screenshot tools — preset angles framed on the scene or on a node, or
      cameras at a position — rendered by temporary cameras into one labelled contact sheet; `node_get_bounds` for a
      scene or for the running game (`in_game`).
- [x] `editor_screenshot`: the open scene from the editor camera or from views, without the grid and gizmos, with a
      note when the editor's preview sun and sky light the render.
- [x] `editor_launch`: starts the editor as a detached process, waits up to three minutes for the plugin, and does
      nothing when the editor is already connected; not-connected errors and `godot_status` point to it.
- [x] `script_validate` (LSP and the fallback).
- [x] `docs_class`, `docs_search`: the reference of the installed engine from its API dump with docs, cached per
      engine version, and the project's own classes from their `##` doc comments; BBCode → Markdown; search by
      words in names and summaries. They work without the editor.
- [x] `scene_batch_edit`: node and signal operations in one call and one Undo action, applied in order so later
      operations use the nodes that earlier ones added or renamed; nothing changes when one fails.
- [x] `node_reparent` (move, rename, reorder; keeps the world transform and updates `NodePath` properties),
      `node_duplicate`, `node_find`.
- [x] `signal_list`, `signal_connect`, `signal_disconnect`: persistent connections that are saved with the scene;
      a missing or mismatched method is reported with the function to add.
- [ ] Optional: a Claude Code `PostToolUse` hook for `.gd` files — after every script edit Claude immediately gets the
      diagnostics without a separate `script_validate` call. It is enabled in the game project's settings, at your
      discretion.

Order of work: `script_validate`; a request channel from the editor to the running game, then `game_get_tree`,
`game_get_properties`, `game_set_properties` and `game_wait`; `game_input` together with `input_map_get` /
`input_map_set` from milestone 3, because the scenario below holds the `move_forward` action, which has to exist
first; the screenshots, camera views and `node_get_bounds`, which also finish spike 8 for images; the scene editing
tools; `docs_class` / `docs_search`; `editor_launch`; the acceptance test.

**Done when** this passes: "Make a third-person prototype: a `CharacterBody3D` player that walks with WASD and jumps
on Space in the arena; make sure it works." The agent writes the script, checks it with `script_validate`, builds the
scene with one `scene_batch_edit`, runs the game, holds `move_forward` for one second, renders the scene from two
angles, reads the player's `position`, confirms that it moved and that `is_on_floor()` is true after landing.
A deliberately broken script is caught by `script_validate` before running.

Status: done, except the optional hook. The scenario passes as the automated acceptance test
`server/test/integration/milestone2Scenario.test.ts`, which starts the editor with `editor_launch` (headless, or with
a window and the two renders when `GODOT_MCP_WINDOW_TESTS=1`), and it passed in a live Claude Code session on
2026-10-22. The live run found three problems, now fixed:

- Without `GODOT_BIN` and a running editor, no Godot binary was found, so `editor_launch`, the docs tools and the
  check without the editor could not work. The server now also takes the executable of the editor that last opened
  the project from the discovery file.
- The parse errors that the editor printed while loading the broken script reached the agent one call late, after
  the fixed script had passed `script_validate`. `editor_rescan` now returns once the editor has applied the scan, so
  such errors come with the call that caused them, and `script_validate` leaves out editor errors about loading the
  scripts it checked (§9.6).
- Claude Code runs the tool calls of one message at the same time (§8.12); the server instructions now say so.

### Milestone 3 — Project, resources, tests

- [x] `autoload_add` / `autoload_remove`, `node_set_groups` (also an operation of `scene_batch_edit`), `editor_select`,
      `scene_close` (`input_map_*` moved to milestone 2). Autoload names are checked before the editor sees them,
      because the editor answers a bad name with a modal warning; a scene with unsaved changes is closed only when
      `unsaved` says to save or to discard them, because `EditorInterface.close_scene()` discards them silently.
- [x] `resource_create`, `resource_get`, `resource_set_properties`: `.tres` files of engine classes and of the
      project's own classes, saved at once (§8.5).
- [x] `test_run` (GUT and gdUnit4, JUnit parsing), checked against GUT 9.7.1 and gdUnit4 6.2.2 (§8.8).
      `scripts/install-gdunit4.sh` installs gdUnit4 for the tests as the Asset Library package, without its own
      tests; `project_info` lists the project's own global classes and counts those of each addon (§8.1).
- [x] Deterministic mode: `fixed_fps`, `game_pause`, `game_step` (§9.10), and `game_performance`.
- [x] `game_eval`, `node_call_method`, `editor_run_script` — behind flags; the read-only mode and `GODOT_MCP_DISABLE`
      (§8.12).
- [x] MCP resources and prompts; the companion skill (§8.10).

Order of work: the resource tools, which the scenario below needs for the `PhysicsMaterial`; `test_run`, which runs
its GUT test; the small editor tools (`autoload_*`, `node_set_groups`, `editor_select`, `scene_close`); the
deterministic mode after its spike, together with `game_performance`; the escape hatches behind flags and the
read-only mode; MCP resources, prompts and the skill; the acceptance test.

**Done when** this passes: "Add a `dash` action (Shift and gamepad B), create a `PhysicsMaterial` for ice, write a GUT
test for `Player.dash()` and run it" — the tests are green and nothing was done by hand.

Status: done. The scenario passes as the automated acceptance test
`server/test/integration/milestone3Scenario.test.ts`, headless or with a window when `GODOT_MCP_WINDOW_TESTS=1`. In
a small game with a player and an arena it starts the editor with `editor_launch`, adds the `dash` action on Shift
and gamepad B, creates `res://materials/ice.tres` and lays an icy patch with it, writes the GUT test for
`Player.dash()` first (it does not load until the dash exists), adds `dash()`, checks both scripts, runs the tests
green and dashes in the running game. Preparing it showed that `test_run` summed up a run whose only test script
failed to load as "found no tests", with the naming convention as the hint, and that a run could say "all passed"
while a test script had not loaded; the summary now counts the scripts that failed to load (§8.8).

The live run in Claude Code on 2026-10-22 passed the same scenario in `test-project` with an editor window: the
action, `res://prototype/ice.tres` under an icy patch measured to rest on the floor, the test first (red: it did not
load), `dash()`, 2 of 2 tests green, and a 3.5 m dash in the running game. It found three problems:

- `input_map_set` stored the gamepad B button for the first gamepad only (device 0), while the editor stores events
  for all devices; it now stores every event for all devices (§9.9).
- The editor's parse errors about the new test script reached the agent one call after `test_run`, as a ⚠ that
  repeated the load error `test_run` had reported, after the script was already fixed. `test_run` now pings the
  editor after the run and leaves those errors out (§9.6). The underlying delay also affected `editor_rescan`: it
  returned in the middle of the editor's apply of the scan whenever the editor showed a progress dialog for more
  than one script; it now waits for the end of the apply (§9.6).
- `project_info` listed 100 global classes, which in `test-project` were almost all gdUnit4's: about 11 KB of output
  on every first call. It now lists the project's own classes and counts those of each addon, and the overview of
  `test-project` takes under 1 KB (§8.1).

A second live run with the fixes and a fresh editor saw `"device": -1` on both events of `dash` in `project.godot`,
and a broken test in a new folder: the editor printed its parse errors, while neither the result of `test_run` nor
the next call showed a ⚠.

### Milestone 4 — 3D tooling and advanced features

- [ ] 3D first: `asset_import_settings_*`, `navigation_bake`, `animation_*`; `gridmap_*` if evaluations show the need.
- [ ] Windowless mode: scene operations through the headless editor or `--headless --script` (based on spike 6);
      a TCP transport for the runtime agent when the game runs as a process (port and token passed as user
      arguments after `--`).
- [ ] Debugging through DAP: breakpoints, stack, variables.
- [ ] `export_project`.
- [ ] `filesystem_move`, `filesystem_delete`, `resource_find_usages`.

**Done when** every capability is covered by its own scenario in `docs/evals/`, for example: "import a glTF
character, scale it to 1.8 m, add a capsule collision", "bake navigation for the arena and make an enemy follow the
player".

### Milestone 5 — Polish and distribution

- [ ] An npm package with the addon bundled; `install-addon`, `update-addon` and `doctor` (environment diagnostics)
      commands.
- [ ] A Claude Code plugin that bundles the MCP server configuration, the `.gd` validation hook and the skill:
      `plugin/` gains `.claude-plugin/plugin.json` and a `.mcp.json` that points at the server through
      `${CLAUDE_PLUGIN_ROOT}`; the skill is already in `plugin/skills/godot/`.
- [ ] An editor dock: status, a log of agent commands, toggles for dangerous features.
- [ ] User documentation: how to connect and how to use (see [User documentation](#user-documentation)).
- [ ] `CONTRIBUTING.md`, `SECURITY.md`.
- [ ] Evaluation tasks (§13) and tool description tuning based on their results.
- [ ] CI: lint, unit tests, integration tests with headless Godot (matrix 4.5 / 4.7 / the pinned `master` commit).
- [ ] Publication to npm and the Godot Asset Store (it replaced the Asset Library in 4.7).

**Done when** the package is published, CI is green and the user documentation passes its check (below).

### User documentation

At the end of development we write user documentation that is short and simple: plain language, short numbered
steps, commands ready to copy, each page readable in about five minutes. It is written for a person who has never
seen the project.

**`docs/setup.md` — how to connect**

1. Requirements: Godot 4.5 or newer (tested on 4.7 and 4.8), Node.js 22 or newer, Claude Code.
2. Installing the addon into a game project and enabling it in Project → Project Settings → Plugins.
3. Connecting Claude Code: the Claude Code plugin, `.mcp.json` or `claude mcp add`; setting `GODOT_BIN` when Godot
   isn't on `PATH`.
4. Checking the connection: ask Claude to "check the Godot connection" — `godot_status` shows the connected editor
   and the Godot version.
5. Troubleshooting: the editor isn't connected, Godot isn't found, the addon and server versions differ;
   `npx godot-mcp-tool doctor`.

**`docs/usage.md` — how to use**

1. What the work looks like: the project is open in Godot and you talk to Claude in plain language; Claude edits
   scenes through the editor (Ctrl+Z works), writes scripts, runs the game and checks the result itself.
2. Example requests for typical tasks: build a level, add a player controller, playtest and show the scene from
   several angles, find and fix errors, run the tests.
3. Safety: undo, confirmation of dangerous tools, read-only mode, how to enable the tools that are off by default.
4. Slash commands: `/mcp__godot__playtest`, `/mcp__godot__fix_last_run`.
5. Limitations: no screenshots without a window, scenes aren't edited as text while the editor is open, a game
   paused on an error.
6. A link to the full tool reference, `docs/tools.md`, which is generated from the code and can't go out of date.

**README** — what the project is, a five-minute quick start and links to both guides.

**Check:** a clean Godot project is connected and a first task is completed by following only these two guides,
without reading the code. You run this check yourself, on a fresh project.

---

## 13. Testing and evaluation

Tests are written before the code they cover (TDD, §11.3). The levels:

| Level | What we check | Tools |
|---|---|---|
| Unit, server | NDJSON and LSP framing, discovery, formatters, truncation, schemas; tool handlers against a fake bridge | vitest |
| Unit, addon | Variant codec, path sandbox, JSON-RPC dispatcher | GUT (`EditorInterface` isn't available in such runs — editor commands are covered by integration tests) |
| Contract | every server tool maps to a method the addon declared in `hello`; the schema matches what the handler really accepts (other projects' schemas advertised actions that didn't work) | vitest + Godot |
| Integration | a real editor (`--headless --editor` if spike 6 succeeds, otherwise a regular editor on macOS) + an MCP client from the SDK → our server → checks of files and the scene tree | vitest + Godot |
| Lifecycle | editor restart, two clients, a dead discovery file, closing stdin, the conflict from §9.3 | vitest + Godot |
| Runtime and screenshots | rendering is required: locally on macOS, in CI on Linux via Xvfb (or skipped) | vitest + Godot |
| Manual | tool calls, schemas, responses | MCP Inspector |
| Evaluations | 15–20 realistic 3D tasks in `docs/evals/` ("add a health bar HUD", "fix the error from the last run", "an enemy patrols between two points", "import a model and give it collision"); we record success, the number of calls and tokens; for comparison, the same tasks run on one existing server | Claude Code |

Tuning tool descriptions, defaults and error texts based on the evaluations is the cheapest way to improve how well
the agent works.

---

## 14. Connecting to Claude Code

Claude Code (including the Code tab of the desktop app) reads `.mcp.json` from the root of the game repository and
asks for confirmation the first time:

```json
{
  "mcpServers": {
    "godot": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/facelessdiplomat/Projects/godot-mcp-tool/server/dist/index.js"],
      "env": {
        "GODOT_BIN": "/Users/facelessdiplomat/Software/godot/bin/godot.macos.editor.arm64"
      }
    }
  }
}
```

The same from a terminal, if the `claude` CLI is installed:

```bash
claude mcp add --env GODOT_BIN=/Users/facelessdiplomat/Software/godot/bin/godot.macos.editor.arm64 --scope project godot -- node /Users/facelessdiplomat/Projects/godot-mcp-tool/server/dist/index.js
```

Another flag (here `--scope`) must stand between `--env` and the server name, otherwise the name is read as one more
variable.

| Scope (`--scope`) | Stored in | When to use |
|---|---|---|
| `local` (default) | `~/.claude.json` | only you, only this project |
| `project` | `.mcp.json` at the project root | shared with everyone who works on the game repository |
| `user` | `~/.claude.json` | all your projects |

Once the package is published, the path to `dist/index.js` is replaced by `"command": "npx", "args": ["-y",
"godot-mcp-tool"]`.

Server environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `GODOT_BIN` | path to the Godot binary | auto-detection |
| `GODOT_PROJECT_PATH` | path to the project | `CLAUDE_PROJECT_DIR`, then a search for `project.godot` upwards from the working directory |
| `GODOT_MCP_DISABLE` | tools to turn off (comma-separated) | — |
| `GODOT_MCP_READ_ONLY` | read-only mode | `0` |
| `GODOT_MCP_UNSAFE` | allow `editor_run_script`, `game_eval` and the like | `0` |
| `GODOT_MCP_LOG_LEVEL` | server log level (stderr) | `info` |

In the game repository, during development the addon is a symlink, and the plugin is enabled in Project → Project
Settings → Plugins:

```bash
ln -s ~/Projects/godot-mcp-tool/addon/addons/godot_mcp_tool <game>/addons/godot_mcp_tool
```

While it is a symlink, add `addons/godot_mcp_tool` to the game's `.gitignore`: a symlink to an absolute local path
is useless to anyone else. After publication, `install-addon` copies a release version of the addon that can be
committed.

Until the plugin of milestone 5 bundles it, the companion skill is linked the same way, and `.claude/skills/godot`
goes into the game's `.gitignore` too:

```bash
ln -s ~/Projects/godot-mcp-tool/plugin/skills/godot <game>/.claude/skills/godot
```

In a session, `/mcp__godot__fix_last_run` and `/mcp__godot__playtest res://levels/arena.tscn` start the prompts, and
`@godot:godot://scene/main.tscn` attaches the node tree of a scene to a message.

In this repository, `.mcp.json` at the root starts `server/dist/index.js` for `test-project/`, so a Claude Code session
opened here can use the server while it is being developed (run `npm run build` in `server/` first).

MCP clients start stdio servers with a minimal environment: variables of your shell are not inherited, so
`GODOT_PROJECT_PATH` and `GODOT_BIN` go into the `env` block of the configuration.

Debugging: MCP Inspector — `npx @modelcontextprotocol/inspector -e GODOT_PROJECT_PATH=<project> node server/dist/index.js`;
in the Claude Code CLI — `claude --debug=mcp` (the server's stderr ends up in `~/.claude/debug/<session-id>.txt`).

---

## 15. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Engine regressions in the `master` build we target | high | medium | a pinned engine commit, deliberate updates, CI on 4.7 stable to tell our bugs from engine bugs |
| An agent edit overwritten by a stale script copy from editor memory | medium | high | sync before saving and running, `CONFLICT`, auto-reload recommendation (§9.3) |
| 3D results are hard to verify visually | high | medium | structured checks (bounds, properties) first, renders from several angles, 3D evaluation tasks |
| Latency or a blocked editor main thread | medium | medium | per-frame time budget, `await` between steps, timeouts, advice on the sleep setting |
| Modal editor dialogs block commands | medium | medium | detection, `EDITOR_BUSY` with a hint |
| A game paused on error "hangs" the scenario | high | medium | `--ignore-error-breaks` for agent runs, the `paused_on_error` state, `game_stop` |
| Large responses eat the context | high | high | default limits, cursors, text summaries, downscaled screenshots, contact sheets |
| Too many tools confuse the agent | medium | medium | tool search and `alwaysLoad` for the core, evaluations, merging rare operations |
| The agent and the user edit the same scene | medium | medium | everything through the editor and Undo/Redo, explicit saving, no text edits of `.tscn` |
| Server and addon versions drift apart | medium | low | protocol version in the handshake, `update-addon` |
| The MCP specification changes | medium | low | version negotiation is handled by SDK v2; we keep the SDK up to date |
| An attack on the local port | low | high | 127.0.0.1, a token, TCP instead of HTTP/WS, dangerous tools off |
| No screenshots in headless mode | high | low | a clear error; process runs get a window; rendering in CI via Xvfb |
| A custom build has no export templates | high | low | a check in `export_project`, instructions for building `target=template_release` |

---

## 16. Next steps

1. Milestone 0: `git init`, MIT license, the `server/` and `addon/` skeletons, `test-project/`, spikes 1–11.
2. Create the public GitHub repository — when you say so.
3. After the spikes, adjust this plan and record the decisions in Appendix A.

---

## Appendix A. Decision log (ADR)

### ADR-1. An external stdio server plus an addon, not an MCP server inside the editor

- **Alternative:** the addon implements MCP over HTTP (Streamable HTTP) itself and Claude Code connects by URL
  (that's how Godot-MCP-Native and Beckett work).
- **Why not:** when the editor is closed there is no server at all — no way to launch the editor, read the docs or
  work headless. MCP and HTTP would have to be implemented in GDScript. HTTP on localhost is reachable from web pages
  (DNS rebinding) and needs strict `Origin`/`Host` checks. Schemas and validation are easier to write and test in
  TypeScript.
- **Cost:** two components, our own bridge protocol, version control between them.

### ADR-2. TypeScript, not Python

- The official TypeScript SDK (v2) is the reference MCP implementation; `npx` is the usual distribution for MCP
  servers; zod schemas; Node handles processes and sockets well. One runtime instead of a Python/uv chain.
- Python is an equivalent alternative (`mcp` 2.x, where `FastMCP` was renamed `MCPServer`; Python 3.15 and uv are
  installed). The choice of TypeScript isn't fundamental, but changing it after milestone 1 would be expensive.

### ADR-3. TCP + NDJSON instead of WebSocket or HTTP

- A web page can't open a raw TCP connection; an HTTP request to this port is dropped as non-JSON.
- Godot has `TCPServer` + `StreamPeerTCP`, Node has the built-in `net` module: no dependencies. Easy to debug with
  `nc`.
- WebSocket would add the buffer limits of `WebSocketPeer` (they'd have to be raised for large messages) and allow
  connections from browser pages. In several existing projects the WebSocket handshake is a source of instability.

### ADR-4. Runtime access through the debugger channel

- No new ports or authentication — the engine already established the channel. Automatically inactive in release
  builds. Works for a game embedded in the editor too. godot-ai and satelliteoflove take the same approach.
- Limitation: only when the game is launched from the editor. For process runs (milestone 4) we add a TCP transport
  with the port taken from the user arguments (`OS.get_cmdline_user_args()`).

### ADR-5. Script diagnostics through the editor's LSP

- Structured errors and warnings from the same analyzer the editor uses, with positions; a file can be checked before
  it is saved. The fallback is `--check-only`.

### ADR-6. Docs from the installed engine

- Exactly matches the version (important for a `master` build), works offline, doesn't depend on the docs website.
- The descriptions come from `--dump-extension-api-with-docs`, which reads the help compiled into the editor;
  `--doctool` alone writes empty descriptions outside the engine source tree (checked on 4.8, 2026-10-22).

### ADR-7. Scenes and resources are changed only through the editor

- `.tscn`/`.tres` are text, but with `ext_resource`/`sub_resource` references, UIDs and `owner` rules. Hand edits
  break easily and conflict with the copy open in the editor. The editor API gives Undo/Redo, a correct `owner` and
  UIDs.

### ADR-8. The addon is the server, the MCP server is the client

- There is one long-lived editor per project; there can be several short-lived MCP server processes (one per Claude
  Code window, plus short-lived copies for version checks).
- If the MCP process hosted the bridge (as in Godlink and Godot MCP Pro), instances would fight over ports and need
  port ranges or a "primary" instance forwarding requests. With the editor as the server, an ephemeral port and a
  discovery file, any number of clients connect without conflicts.

### ADR-9. Claude Code as the only supported client

- We rely on Claude Code extensions: `_meta["anthropic/alwaysLoad"]`, `_meta["anthropic/requiresUserInteraction"]`,
  hooks, skills and plugin packaging; tool search removes the need for tool profiles.
- Cost: other clients will probably work but aren't tested. They ignore the Claude Code-specific `_meta` keys, so
  nothing breaks for them.

---

## Appendix B. Verified Godot API facts

Checked against the sources in `~/Software/godot` (`master`, 4.8-beta, commit `6790667`, 2026-10-20):

| Fact | Where |
|---|---|
| `Logger` (`_log_error` with `ScriptBacktrace[]`, `_log_message`) is registered with `OS.add_logger` and called from different threads | `doc/classes/Logger.xml` (added 2025-03, Godot 4.5) |
| `EngineDebugger.register_message_capture(name, callable)` receives `name:*` messages; `send_message(message, data)` | `doc/classes/EngineDebugger.xml` |
| `EditorDebuggerPlugin._has_capture/_capture/_setup_session`; `EditorDebuggerSession` has `send_message`, `is_breaked` and the signals `started/stopped/breaked/continued`, but no `continue` method | `doc/classes/EditorDebugger*.xml` |
| `EditorPlugin._run_scene(scene, args)` can change the launch arguments; it is called for every way of running, including the main scene | `doc/classes/EditorPlugin.xml`, `editor/run/editor_run_bar.cpp` |
| `EditorInterface`: `play_main_scene/play_current_scene/play_custom_scene/stop_playing_scene`, `open_scene_from_path`, `save_scene(_as)`, `get_editor_viewport_2d/3d`, `get_editor_undo_redo`, `get_open_scene_roots`, `close_scene`; `get_unsaved_scenes` since 4.7 | `doc/classes/EditorInterface.xml`, `CHANGELOG.md` |
| `EditorFileSystem`: `scan`, `scan_sources`, `update_file`, `reimport_files`; signals `filesystem_changed`, `resources_reimported`, `script_classes_updated` | `doc/classes/EditorFileSystem.xml` |
| `EditorFileSystem.is_scanning()` turns false when the scan thread ends; the editor applies the scan (new file tree, script classes, loading changed and new scripts) in its next `NOTIFICATION_PROCESS`, which comes after the `process_frame` signal. The scan thread of a rescan saves the file system cache before the new tree replaces the old one, so the cache on disk lags one scan behind, and the next rescan registers and loads the scripts this one found new or changed once more. Only an editor with a window loads new scripts for their documentation: a headless editor runs in `cmdline_mode` and prints no parse errors for a new broken script | `editor/file_system/editor_file_system.cpp`, `editor/editor_node.cpp` |
| In an editor with a window, applying a scan with more than one script to register or document, or more than one scan action, shows a progress dialog, and every update of it runs a whole main loop iteration (`ProgressDialog::_update_ui` → `Main::iteration()`): `process_frame` fires and plugins process in the middle of the apply, and `Engine.get_process_frames()` changes only at the end of that inner iteration; a headless editor prints the progress instead. `sources_changed` is emitted at the end of every applied scan, of `scan()` and of `scan_sources()`, after the scripts are loaded | `editor/file_system/editor_file_system.cpp`, `editor/gui/progress_dialog.cpp`, `editor/editor_node.cpp`, `main/main.cpp`, observed on 4.8 |
| Before running, the editor saves everything: `run/auto_save/save_before_running` = `true`; saving a scene calls `ScriptEditorPlugin::save_external_data()` → `save_all_scripts()`, which writes unsaved script tabs without comparing with the disk | `editor/settings/editor_settings.cpp`, `editor/script/script_editor_plugin.cpp` |
| `ScriptEditor.reload_open_files()` compares each tab's last known modification time (one-second resolution) with the disk: tabs without unsaved changes reload silently when auto-reload is on, tabs with unsaved changes raise the "Files have been modified outside Godot" dialog; `ScriptEditor.get_unsaved_files()`; the editor checks script modification times itself when its window gains focus | `doc/classes/ScriptEditor.xml`, `editor/script/script_editor_plugin.cpp` |
| An autoload added with `EditorPlugin.add_autoload_singleton` reaches `project.godot` only when `ProjectSettingsEditor` saves 1.5 s later, so a game started sooner runs without it; the addon calls `ProjectSettings.save()` itself | `editor/settings/editor_autoload_settings.cpp`, `editor/settings/project_settings_editor.cpp` |
| Game output and errors forwarded by the debugger go straight to the editor's Output panel and do not pass through `Logger`s registered in the editor | `editor/debugger/script_editor_debugger.cpp` |
| `Node3D.rotation_degrees`, `global_position` and `transform` have no `PROPERTY_USAGE_EDITOR`; the inspector shows `rotation` in degrees, but it is stored in radians | `scene/3d/node_3d.cpp` |
| Scenes saved by 4.8 carry `unique_id=` in every `[node …]` header | saved `.tscn` files |
| `--lsp-port` sets `GDScriptLanguageServer::port_override` and is not passed on to `OS.get_cmdline_args()` | `main/main.cpp` |
| The language server parses every project script on its first `initialize`, logs `LSP: Failed to parse script` for broken ones, and on `initialize` from another project root sends `window/showMessage` and `gdscript_client/changeWorkspace` with its own project path | `modules/gdscript/language_server/` |
| A language server client must close a document before opening it again; `didOpen` parses the sent text and always publishes diagnostics, even an empty list | `modules/gdscript/language_server/gdscript_language_protocol.cpp` |
| `Input.parse_input_event` may buffer events until the next frame; `Input.flush_buffered_events()` delivers them at once. An `InputEventAction` is matched to its action by name, so it sets the action state and reaches `_input` too. The headless display server also delivers events to the window | `core/input/input.cpp`, `core/input/input_map.cpp`, `servers/display/display_server_headless.cpp` |
| A `SceneTreeTimer` counts frame time, so it can end before the same wall-clock time has passed; real-time waits poll `Time.get_ticks_msec()` | observed in GUT runs |
| `InputEvent.as_text()` is not uniform for physical keys ("W - Physical", "Up"); the addon writes its own short text ("W", "Ctrl+S", "Mouse left", "Joypad a") | observed on 4.8 |
| A static function on a preloaded script is shadowed by a `Resource` or `Object` method of the same name (`is_built_in`, `get_name`, …), because the call goes to the script resource itself | observed on 4.8 |
| `TCPServer.listen(port, bind_address = "*")` listens on all interfaces by default; `get_local_port()` | `doc/classes/TCPServer.xml` |
| The maximum debugger message size is 8 MiB | `core/debugger/remote_debugger_peer.cpp` |
| LSP: port 6005, starts when the editor is ready, up to 8 clients; `didOpen` → parser + analyzer → `publishDiagnostics` | `modules/gdscript/language_server/` |
| Default ports: debugger 6007, DAP 6006 | `editor/settings/editor_settings.cpp`, `editor/debugger/debug_adapter/` |
| CLI: `--headless`, `--editor`, `--path`, `--scene`, `--check-only` (with `--script`), `--import`, `--doctool [path]` (implies headless), `--gdscript-docs`, `--lsp-port`, `--dap-port`, `--quit-after`, `--fixed-fps`, `--ignore-error-breaks`, `--export-release/--export-debug/--export-pack` | `main/main.cpp` |
| Feature tags `editor_runtime`, `editor_hint`, `embedded_in_editor` | `core/os/os.cpp` |
| File logging is on for desktop: `debug/file_logging/enable_file_logging.pc = true`, path `user://logs/godot.log` | `main/main.cpp` |
| Editor settings: `text_editor/behavior/files/auto_reload_scripts_on_external_change` = `true`, `interface/editor/timers/unfocused_low_processor_mode_sleep_usec` = 100000 | `editor/settings/editor_settings.cpp` |
| `JSON.from_native/to_native` (since 4.3), `ClassDB.class_get_property_default_value`, `ProjectSettings.get_global_class_list` | `doc/classes/` |
| A `Node3D` follows only a direct `Node3D` parent: under a plain `Node` its own transform is its global transform | `scene/3d/node_3d.cpp` |
| `CanvasItem.queue_redraw()` draws through a deferred call. `SceneTree.process` emits `process_frame`, flushes the message queue, runs `_process` and flushes again, so a node added during a frame has drawn itself by the next `process_frame` | `scene/main/canvas_item.cpp`, `scene/main/scene_tree.cpp` |
| GUT 9.7.1 on the command line: `-gdir` (with `-ginclude_subdirs`), `-gtest`, `-gunit_test_name`, `-gjunit_xml_file`, `-gexit`; it reads `res://.gutconfig.json` by default and exits with code 1 when a test fails. Its JUnit report puts the script path without `res://` into `classname` and the failing line as "at line N" at the end of the failure text | GUT `cli/gut_cli.gd`, `junit_xml_export.gd`, `gui/GutRunner.gd` |
| gdUnit4 6.2.2 on the command line (`res://addons/gdUnit4/bin/GdUnitCmdTool.gd`, works on 4.8): it refuses headless mode without `--ignoreHeadlessMode`, stops at the first failure without `-c`, takes test suites or folders with `-a` but not single tests, resolves `-rd` inside the project and writes `report_<n>/results.xml` there, with `FAILED: <path>:<line>` in the `message` attribute and `package` set to the folder of the suite; it exits with code 100 when a test fails. The Asset Library package leaves out `addons/gdUnit4/test` | gdUnit4 `src/core/runners/GdUnitTestCIRunner.gd`, `src/reporters/xml/JUnitXmlReportWriter.gd`, `.gitattributes`, observed |
| `EditorPlugin.add_autoload_singleton` with a name that is not a valid identifier, or that collides with an engine class, a `class_name`, a built-in type, a global constant or a keyword, shows a modal warning in the editor; `remove_autoload_singleton` erases the autoload only from the runtime list, so its `autoload/` setting stays in `project.godot` until it is set to `null` — the Delete button of the dialog does that and then calls `EditorAutoloadSettings.update_autoload()`, which also drops the global name from GDScript | `editor/settings/editor_autoload_settings.cpp`, `core/config/project_settings.cpp`, observed on 4.8 |
| `EditorInterface.close_scene()` closes the current scene without asking and discards its unsaved changes; `get_unsaved_scenes()` (since 4.7) tells which scenes have them | `editor/editor_interface.cpp`, `editor/editor_node.cpp` |
| All 529 global constants of `@GlobalScope` are written in capitals and start with one of 26 words (`KEY`, `PROPERTY`, `ERR`, `TYPE`, `JOY`, `OP`, `MIDI`, `MOUSE`, …, `OK`, `FAILED`); scripts cannot list them | `doc/classes/@GlobalScope.xml` |
| `SceneTree.physics_frame` is emitted at the start of a physics tick, before `_physics_process` of the nodes and before the physics server steps; pausing the tree also deactivates the physics servers, and the signal keeps firing while paused | `scene/main/scene_tree.cpp`, observed on 4.8 |
| `SceneTree.set_suspend` (the Game view's suspend) is not bound for scripts; the debugger message `scene:next_frame` lifts it until the next `frame_post_draw` | `scene/main/scene_tree.cpp`, `scene/debugger/scene_debugger.cpp` |
| `--fixed-fps N` makes every process frame advance the game by exactly 1/N s and drops real-time synchronization: without a window the game runs uncapped; it is an engine argument that `OS.get_cmdline_args()` does not show | `main/main.cpp`, observed on 4.8 |
| A `GDScript` made in memory gets the path `gdscript://<instance id>.gd`: its parse errors and runtime errors carry that file and the line in the source, and a `Logger` added for the duration of `reload()` and the call sees them; a function declared `-> Variant` must return on every path | `modules/gdscript/gdscript.cpp`, observed on 4.8 |
| `EditorSettings.get_project_metadata` loads `.godot/editor/project_metadata.cfg` once, on the first access, and the editor writes it back later, so a file written before the editor starts is read | `editor/settings/editor_settings.cpp` |
| `GDScript.can_instantiate()` is false inside the editor for scripts without `@tool`, because scripting is disabled there; the editor creates an object of a `class_name` by instantiating the native base class and calling `set_script`, which gives it a placeholder instance that keeps the exported values | `modules/gdscript/gdscript.cpp`, `editor/editor_data.cpp` |
| An `UndoRedo` property change on a `Resource` marks it as edited, and saving a scene also saves the edited external resources; `ResourceSaver.save` in the editor updates the file system dock through the save callback | `core/object/undo_redo.cpp`, `editor/editor_node.cpp` |
| `var_to_str` writes a float that holds a single-precision value with the fewest digits for single precision (`0.05`), while `JSON.stringify` writes 15 significant digits of the double (`0.0500000007450581`) | observed on 4.8 |
| `Material`, `Texture2D` and `Mesh` can be instantiated, as classes meant to be extended by scripts, while `Shape3D` and `BaseMaterial3D` are abstract; scripts cannot ask `ClassDB` which classes are virtual | observed on 4.8 |
| `Viewport.get_visible_rect()` returns the 2D size override (the base size of the `canvas_items` stretch mode), while the root viewport's texture has the window's size in pixels | `scene/main/viewport.cpp` |
| `Vector3.snapped(Vector3.ONE * 0.001)` leaves float32 noise such as `3.0000002`, and `String.num(10.0, 2)` gives `"10.0"`; the addon rounds with `(v * 1000.0).round() / 1000.0` and writes whole numbers itself | observed on 4.8 |
| Removing a node from a parent in the tree clears the owner of every moved node whose owner is no longer an ancestor; `set_name` with a sibling's name silently adds a number | `scene/main/node.cpp` (`_propagate_after_exit_tree`, `_validate_child_name`) |
| `Node.duplicate()` leaves the owners of the copies empty, except inside instanced scenes; `DUPLICATE_SIGNALS` copies persistent connections and retargets the ones inside the copied branch | `scene/main/node.cpp` |
| `UndoRedo` runs undo operations in the order they were added; `commit_action(false)` registers an action without executing it | `core/object/undo_redo.cpp` |
| `--doctool <folder>` generates the class structure from ClassDB and merges the descriptions of XML files already in the folder (`doc/classes`, `modules/*/doc_classes`), so in an empty folder every description is empty; `--dump-extension-api-with-docs` writes `extension_api.json` into the working folder with the descriptions of the editor's help (`EditorHelp::get_doc_data()`), but without the `@GDScript` page and without default values of properties | `main/main.cpp`, `core/extension/extension_api_dump.cpp` |
| In the API dump an enum property has the type `int`; its setter's last argument carries the enum type (`enum::Class.Name`, `bitfield::…`) | `extension_api.json` |
| `--doctool <folder> --gdscript-docs res://` with `--path` writes one XML file per script, named after its `class_name` (or the quoted file name), with descriptions from `##` comments; a script that does not parse is skipped with an error | `main/main.cpp`, observed on 4.8 |
| Bound callables are equal when their base callable and bound arguments are equal, so `disconnect` works with a callable bound again; a non-tool script in the editor has a placeholder instance whose `has_method` checks the script and its base scripts | `core/variant/callable_bind.cpp`, `core/object/script_language.cpp` |
| GDScript files may preload each other, and a script may preload itself | observed on 4.8 |
| `InputMap` matches an event of an action against an incoming event only when the action's event has the device `ALL_DEVICES` (-1, not exposed to scripts) or the same device; new `InputEventKey` and mouse events get `DEVICE_ID_KEYBOARD` (16) and `DEVICE_ID_MOUSE` (32), joypad events default to device 0, the first gamepad, and the editor's Input Map dialog stores "All Devices" | `core/input/input_map.cpp`, `core/input/input_event.cpp`, `editor/settings/input_event_configuration_dialog.cpp` |
| The analyzer reports a member that a class lacks when it is read through the class (`Player.SPEEDD` is a parse error), but a method or property that the type of a variable lacks (`player.dashh()` on a `Player` or a `CharacterBody3D` variable) compiles: only the `unsafe_method_access` and `unsafe_property_access` warnings report it, and both are off by default. `:=` cannot infer the type of a member that the static type lacks, so it works on a variable typed with the `class_name` of its script and fails on one typed with the native base | observed on 4.8 with `--check-only` |
| 3D: `NavigationRegion3D.bake_navigation_mesh()` and the `bake_finished` signal; `Viewport.world_3d` / `own_world_3d`; `physics/3d/physics_engine` (`DEFAULT` currently means GodotPhysics3D; Jolt can be selected); CSG nodes (`CSGBox3D`, `CSGCombiner3D`, …); `GridMap.set_cell_item` | `doc/classes/`, `modules/csg/doc_classes/` |

---

## Appendix C. Sources

Checked on 2026-10-21.

**MCP and Claude Code**

- MCP specification versions: https://modelcontextprotocol.io/specification/versioning
- Changes in revision 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28/changelog
- Tools in the specification: https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP Inspector: https://github.com/modelcontextprotocol/inspector
- MCP in Claude Code: https://code.claude.com/docs/en/mcp
- Claude Code environment variables: https://code.claude.com/docs/en/env-vars
- Anthropic, "Writing effective tools for AI agents": https://www.anthropic.com/engineering/writing-tools-for-agents

**Existing Godot MCP servers**

- https://github.com/hi-godot/godot-ai
- https://github.com/Coding-Solo/godot-mcp
- https://github.com/satelliteoflove/godot-mcp
- https://github.com/tomyud1/godot-mcp
- https://github.com/youichi-uda/godot-mcp-pro
- https://gdaimcp.com
- https://github.com/ee0pdt/Godot-MCP
- https://github.com/yurineko73/Godot-MCP-Native
- https://github.com/HaD0Yun/Doyunha-Gopeak
- https://github.com/tugcantopaloglu/godot-mcp

**Godot**

- Proposal for a built-in AI assistant (closed as "not planned"): https://github.com/godotengine/godot-proposals/issues/12409
- Godot 4.7: https://godotengine.org/releases/4.7/
- Godot 4.8 beta 1: https://godotengine.org/article/dev-snapshot-godot-4-8-beta-1/
