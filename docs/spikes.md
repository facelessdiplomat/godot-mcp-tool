# Milestone 0 spikes

Small throwaway experiments that check the assumptions of the [development plan](DEVELOPMENT_PLAN.md) against a real
engine before we build on them. The spike code lived in a scratch project outside the repository and is not kept;
this file records what we learned.

## Pinned engine

| Item | Value |
|---|---|
| Engine | Godot `4.8.beta.custom_build.679066724`, local source build |
| Commit | `679066724352c12673001d692d41dc2dab9314c0` (`master`, 2026-10-20) |
| Platform | macOS, Apple Silicon |
| Test framework | GUT 9.7.1 |

Update the engine deliberately: pull `master`, rebuild, rerun `npm test`, `npm run test:integration` and
`scripts/test-addon.sh`, then record the new commit here and in `GODOT_MASTER_COMMIT` of `.github/workflows/ci.yml`.

## Summary

| # | Question | Answer | Impact |
|---|---|---|---|
| 1 | Does a `TCPServer` on `127.0.0.1:0` work inside an `EditorPlugin`, and how fast is it? | Yes. `ping` median 6.9 ms with a focused or headless editor, 100 ms with an unfocused windowed editor. Overriding `OS.low_processor_usage_mode_sleep_usec` from the plugin brings the unfocused case back to 6.8 ms | Confirmed. The addon keeps the editor responsive while a client is active (§9.5 of the plan) |
| 2 | Does the `EngineDebugger` ⇄ `EditorDebuggerPlugin` channel work, how much can it carry, and can the game take screenshots? | Yes. Round trip median 34 ms; 7 MB messages arrive, 9 MB ones are dropped silently. On macOS a game started from the editor is embedded in the Game view by default; a viewport screenshot takes 3 ms plus 17 ms for the PNG | Confirmed. Screenshots travel as file paths, never as message payloads |
| 3 | What does a `Logger` receive in the game and in the editor? | Everything we need, with script backtraces even without a debugger (details below) | Confirmed; the error model in §9.6 of the plan is refined below |
| 4 | Does the GDScript language server give usable diagnostics? | Yes, in a headless editor too: ready about 1 s after start, diagnostics 1–9 ms after `didOpen`, no false positives for autoloads and `class_name`, unsaved text is analyzed, warnings carry a code | LSP is the primary way to validate scripts. Checked on 4.8 only, 4.7 is not installed |
| 5 | Can agent runs avoid the pause on script errors, and can a paused game be resumed? | `--ignore-error-breaks` via `_run_scene` prevents the pause. Without it, the raw debugger message `continue` resumes the game, and custom captures keep working while it is paused | A `game_continue` capability is possible; the runtime agent can report state while the game is paused |
| 6 | Does the addon run in `godot --headless --editor`? | Yes: the bridge starts, writes the discovery file, and the full integration test passes against it | Windowless editor mode is viable for CI and milestone 4 |
| 7 | Can `--check-only --script` replace the editor for validation? | Not reliably: the exit code is always 0, and references to autoloads are reported as errors | Demoted to a last-resort fallback that parses stderr and filters autoload false positives |
| 8 | How does Claude Code pass text, `structuredContent` and images to the model? | Text: yes, but several text blocks may reach the model joined without a separator. `alwaysLoad` and the server instructions work. Images: an image block reaches the model as an image, PNG or JPEG, and the text block after it arrives intact. `structuredContent` is not checked: no tool sends it | The new-error summary is appended to the last text block after a blank line. A screenshot is one image block followed by one text block with the size, the notes and the file path |
| 9 | Does the editor overwrite an agent's edit with a stale unsaved script tab? | Yes, both on `save_all_scenes()` and on running the game (`save_before_running` is on by default). `ScriptEditor.get_unsaved_files()` lists the file beforehand | Conflict detection before saving and running is mandatory in milestone 1 |
| 10 | Does a symlinked addon work in a separate project? | Yes: `test-project` uses a relative symlink, the editor loads the plugin and imports work | Confirmed |
| 11 | Can we render from an extra camera in the editor and in the game? | Yes, with a `SubViewport` that shares the scene's `World3D`: 19 ms in the game, 13–44 ms in an unfocused editor with `RenderingServer.force_draw()`. The editor's preview sun and sky belong to that world | Confirmed, with two corrections to the plan (§9.8) |

## Details

### 1. Bridge inside the editor

- `TCPServer.listen(0, "127.0.0.1")` returns an ephemeral port; `get_local_port()` reports it.
- The discovery file is written with owner-only permissions (`-rw-------`) and removed in `_exit_tree`.
- Shutdown behaviour of a headless editor:
  - `SIGINT` is ignored — the editor keeps running;
  - `SIGTERM` and `SIGKILL` stop it without `_exit_tree`, so the discovery file stays behind. The server already reports
    such a file as stale because its `pid` is dead.
  - Tools that start or stop editors (`editor_launch`, test harnesses) must use `SIGTERM`/`SIGKILL`, never `SIGINT`.
- The measured headless latency matches `interface/editor/timers/low_processor_mode_sleep_usec` (6900 µs).

### 2. Debugger channel

- `EditorPlugin._run_scene(scene, args)` receives only the run arguments, not the whole command line. Appending to them
  works: `--headless`, `--ignore-error-breaks`, and user arguments after `--` all reach the game.
- `--headless` is not forwarded to a game started from a headless editor (it is not in
  `Main::get_forwardable_cli_arguments`), so without our `_run_scene` addition such a game would open a window.
  Adding it lets CI run the game from a headless editor with the full runtime channel.
- The game sees `EngineDebugger.is_active() == true` and its user arguments; `spike:ready` arrived about 1 s after
  `play_main_scene()`.
- `EditorDebuggerPlugin._capture` gets the message with its prefix (`spike:ready`); the game-side capture callable
  gets it without the prefix (`ready`).
- Session signals observed: `started`, `breaked`, `continued`, `stopped`.

### 3. Logger

Game (headless, no debugger):

| Source | Logger callback | Useful location |
|---|---|---|
| `print` | `_log_message(message, error = false)` | — |
| `printerr` | `_log_message(message, error = true)` | — |
| `push_warning` | `_log_error`, `error_type` 1 | the first script backtrace frame; `file`/`line` point to `variant_utility.cpp` |
| `push_error` | `_log_error`, `error_type` 0 | the first script backtrace frame |
| script runtime error | `_log_error`, `error_type` 2 | `file`/`line`/`function` are the GDScript location; full backtrace |
| engine error, e.g. `get_node` on a missing node | `_log_error`, `error_type` 0 | the message is in `rationale` ("Node not found: …"), `code` is generic |

Editor: a `Logger` added by a plugin receives GDScript parse and analyzer errors on reload, with the script path and
line (`res://type_error.gd:5`, "Parse Error: Cannot assign a value of type "String" as "int"."). This gives a second
validation path when the language server is not available.

Rules for the error model:

- the displayed message is `rationale` when it is not empty, otherwise `code`;
- the displayed location is the first script backtrace frame when there is one, otherwise `file:line`;
- callbacks arrive on the main thread in these runs, but the documentation allows other threads, so the buffer stays
  behind a `Mutex`;
- the game writes `user://logs/godot.log`, which covers errors that happen before the runtime agent loads.

### 4. Language server

- Start: `--lsp-port` works with `--headless --editor`; the port accepted connections after about 1 s.
- Protocol: `initialize` → `initialized` → `textDocument/didOpen` → `textDocument/publishDiagnostics`.
  The server also sends a custom `gdscript/capabilities` notification.
- Results:
  - valid script using an autoload and a `class_name`: no diagnostics;
  - syntax error and type error: errors with line and column;
  - an unsaved text that differs from the file on disk is analyzed as sent;
  - warnings arrive with severity 2 and a code (`UNUSED_VARIABLE`).
- The same problem may be reported twice (parser and analyzer wording), so `script_validate` deduplicates by
  position.

### 5. Pause on error

| Run | Result |
|---|---|
| without flags | the session emits `breaked`; `is_breaked()` is true; a custom `spike:ping` is still answered; `send_message("continue", [])` resumes the game (`continued`) |
| `--ignore-error-breaks` added in `_run_scene` | no pause; the game continues; the `Logger` still captures the error |

### 7. `--check-only`

| Script | Exit code | Output |
|---|---|---|
| valid, uses a `class_name` and an autoload | 0 | false error: "Identifier not found: SpikeRuntime" |
| syntax error | 0 | `SCRIPT ERROR: Parse Error: …` with `res://…:line` |
| type error | 0 | `SCRIPT ERROR: Parse Error: …` with `res://…:line` |
| valid, no autoloads | 0 | nothing |

Each run takes about 0.15 s.

### 8. Tool results in Claude Code

Checked on 2026-10-22 in the Claude Code desktop app with the `godot` server from `.mcp.json` and a headless editor
on `test-project`:

- At startup only the six tools marked `anthropic/alwaysLoad` were loaded (`godot_status`, `scene_get_tree`,
  `node_add`, `node_set_properties`, `game_run`, `game_get_output`). The other ten were listed by name and loaded
  through tool search on first use. The server instructions arrived as written.
- A result made of two text blocks reached the model as two separate outputs in one call, and as one string joined
  without any separator in another call. The server therefore appends the new-error summary to the last text block
  after a blank line instead of sending it as a block of its own.
- The milestone 1 scenario passed end to end: the arena with its floor, light, environment and camera, the main
  scene, the run with its output, and a deliberate script error with its summary in the next response and its stack
  in `game_get_output`.

Images were checked the same day, after milestone 2 added the screenshot tools, with a windowed editor on
`test-project`:

- `editor_screenshot` (from the editor camera and as a contact sheet of four views), `game_screenshot` (the window,
  and two views as JPEG) and `game_input` with `screenshot: true` each returned an image block and a text block.
- The model received the image itself, then a line `[Image: source: …/tool-results/mcp-godot-blob-….png]` that
  Claude Code adds after saving the image in the session folder, then our text block unchanged.
- A 1280×724 contact sheet and a 1152×648 game screenshot came through without a size warning.

### 9. Stale script overwrite

Sequence: a script is open in the script editor with an unsaved change ("editor B"); the agent writes "agent C" to
the file on disk.

| Trigger | File on disk afterwards |
|---|---|
| `EditorInterface.save_all_scenes()` with an unsaved scene | "editor B" — the agent's change is lost |
| `EditorInterface.play_main_scene()` with `run/auto_save/save_before_running` = `true` | "editor B" — the agent's change is lost |

`ScriptEditor.get_unsaved_files()` returned the file both after the editor change and after the disk write.

### Windowed runs (1, 2, 11)

The editor was started from the app bundle (`open -n -a godot_macos_editor.app --args --editor --path …`), so it
got focus on launch; switching to Finder took the focus away.

Bridge latency (`ping`, 100 requests per phase):

| Editor state | Median | p95 |
|---|---|---|
| focused | 6.8 ms | 7.7 ms |
| unfocused | 100 ms | 101 ms |
| focused again | 6.9 ms | 7.4 ms |
| unfocused, plugin keeps `OS.low_processor_usage_mode_sleep_usec` at 6900 | 6.8 ms | 7.9 ms |

The 100 ms is `interface/editor/timers/unfocused_low_processor_mode_sleep_usec`. The editor resets the value only on
focus changes, so a plugin can override it in `_process` and restore it later.

Game started from the editor (`play_custom_scene`, a lit 3D scene, Forward+ on Apple M4 Pro):

- it ran embedded in the editor (`DisplayServer.get_name()` = `embedded`, feature `embedded_in_editor`), 1152×648;
- `get_viewport().get_texture().get_image()` after `RenderingServer.frame_post_draw`: 3 ms; resize and PNG: 17 ms;
- a render from an extra camera (`SubViewport` with the game's `find_world_3d()`, 640×360): 19 ms; the game's active
  camera stayed current;
- debugger round trip while playing: 27–41 ms.

Renders in the editor:

| Capture | Result |
|---|---|
| `EditorInterface.get_editor_viewport_3d(0)` texture | 2308×1202 on a Retina screen; includes the grid and the axis gizmos |
| extra camera, waiting for `frame_post_draw` | correct image, but 565 ms in one run and 90 s in another: an idle editor in low-processor mode may not draw a frame for a long time |
| extra camera with `RenderingServer.force_draw(false)`, editor unfocused | 13 ms (lit scene), 44 ms (scene without lights) |

Two traps found on the way:

- right after a `Camera3D` enters the tree, its transform reaches the `RenderingServer` only when transform
  notifications are flushed in the next frame (and later still with physics interpolation). A forced draw before that
  renders from the origin. Calling `camera.force_update_transform()` and
  `RenderingServer.camera_set_transform(camera.get_camera_rid(), camera.global_transform)` after adding it fixes this;
- the editor's preview sun and sky live in the same `World3D` as the edited scene, so a render of a scene without its
  own lights from an extra camera is lit like the editor viewport. In the running game the same scene has no light.
  A render without gizmos needs only the default camera cull mask (the editor's gizmo layers are outside it).

### Other observations

- Godot 4.8 writes `unique_id` to nodes and a `uid` to the scene header when it saves a `.tscn`.
- A headless editor reports `Parameter "t" is null` from `servers/rendering/dummy/storage/texture_storage.h` on every
  scene save: without a renderer there is no preview thumbnail. The addon ignores errors from
  `servers/rendering/dummy/`.
- Engine source paths in error reports may start with `./` (headers found through the include path); the addon
  removes the prefix.
- MCP clients start stdio servers with a minimal environment: variables of the parent shell are not inherited, so
  `GODOT_PROJECT_PATH` and `GODOT_BIN` must be passed in the client configuration (`env` in `.mcp.json`, `-e` in MCP
  Inspector).

## Pending

| # | What is left | Needs |
|---|---|---|
| 8 | Whether Claude Code gives the model `structuredContent` instead of the text blocks | a tool that returns `structuredContent`; none does yet |
