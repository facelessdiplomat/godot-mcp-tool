---
name: godot
description: Build and change a Godot 4 game in 3D with GDScript through the godot MCP tools, from scripts and scenes to running, testing and checking the game. Use it whenever you work on a Godot project with these tools.
---

# Godot 4 game development with the godot MCP tools

The godot tools drive the Godot editor and the running game. Work in the loop below; GDScript 4, 3D and testing
are described in the files linked at the end.

## Start of a session

1. `godot_status`: is the editor connected? If not, `editor_launch` starts it, also without a window
   (`headless: true`). The tools that read the project and its scenes, `game_run` and the game tools work without
   the editor too. Without a project, `project_create` makes one and the server works on it right away; a project
   without tests gets GUT from `test_install_framework`.
2. `project_info`: main scene, autoloads, `class_name` classes and the indentation of `.gd` files. Use that
   indentation in every script; never mix tabs and spaces. `input_map_get` lists the input actions.
3. Read before you change: `scene_get_tree` or `node_find` for node paths, `node_get_properties` for values,
   `docs_class` for any engine API you are not sure of. `node_get_properties`, `game_get_properties` and
   `node_get_bounds` take `paths` to read several nodes in one call; the game reads them in the same frame.

## The loop: change, check, run, observe

1. **Scripts**: write `.gd` and `.gdshader` files with your own file tools, then check them with `script_validate`, which
   also compiles shaders and points at the line of their first error. After creating or
   changing scripts that scenes use, adding a `class_name` or rebuilding a GDExtension library, call `editor_rescan`:
   it also reloads the rebuilt library, so scripts see its new classes and methods. Before changing the arguments of
   a function or removing it, list its uses with `script_find_references` rather than a text search: it tells them
   from the uses of a function of the same name in another class, and lists the signal connections and animation
   method tracks of scenes. Rename with `script_rename_symbol`.
2. **Scenes**: never edit `.tscn` or `.tres` files as text while the editor runs. Build with `scene_create` and
   `scene_batch_edit` (many changes as one Undo step; nothing changes when one of them fails), adjust with the
   `node_` tools, connect signals with `signal_connect`. Take changes of these tools back with `editor_undo`, also
   after a save, and do them again with `editor_redo`. Shared materials and other resources: `resource_create`,
   `resource_set_properties`. To change one instance of a scene only, such as making `Enemy2` red, set properties of
   its inner nodes (`Enemy2/Mesh`; `scene_get_tree` of `res://enemy.tscn` shows them); to change every instance,
   edit the instanced scene itself. Paint levels of blocks with `gridmap_set_cells`, after `meshlibrary_create` has
   built their MeshLibrary from a scene of blocks; for 2D tiles build a TileSet from an image with `tileset_add_atlas`
   and paint a `TileMapLayer` with `tilemap_set_cells`. Read the cells back with `gridmap_get_cells` and
   `tilemap_get_cells`.
3. **Project setup**: input actions with `input_map_set`, settings with `project_settings_set`, global singletons
   with `autoload_add`, editor plugins of `res://addons` with `plugin_set_enabled`, groups with `node_set_groups`,
   audio buses such as Music and Effects with `audio_buses_set`.
   Move or rename files and folders with `filesystem_move`, never with shell commands: it updates the scenes,
   resources and settings that use them and lists the scripts to change. Before deleting a file, check with
   `resource_find_usages` that nothing uses it.
4. **Save** with `scene_save`. Changes stay unsaved until then; `game_run` saves first, but `test_run` reads the files
   on disk.
5. **Run** with `game_run` and read errors with `game_get_output`. A ⚠ line in any result means new errors: read them
   before you go on.
6. **Observe** the running game: `game_input` for actions, keys, the mouse and the gamepad, with `read` steps for
   values at exact moments; `game_wait` for a state such as `is_on_floor()`; `game_get_properties` for values,
   getters included; `node_get_bounds` for placement and scale; `game_screenshot`, with `views` for 3D; `game_pause`
   and `game_step` for frame-exact checks; `game_performance`; `user_data_get` for what the game saved in `user://`;
   `audio_buses_get` with `in_game` to hear whether a bus carries sound and which players play;
   `navigation_get_path` to see whether an agent can walk from one point to another.
7. **Test** with GUT tests in `res://test` and `test_run`.
   To find why code misbehaves, stop the game on a line with `debug_breakpoints`, read the stack and the variables
   with `debug_state`, step with `debug_continue`, and remove the breakpoints when done.
8. **Export** with `export_project` and a preset from Project → Export, after saving; `export_preset_add` adds a
   preset for a platform. `mode: "pack"` writes only the game data and needs no export templates.

## Rules that prevent most mistakes

- Write Godot 4 only: `@export`, `@onready`, `await`, `signal.connect(callable)`, `CharacterBody3D`, `Node3D`. Godot 3
  code fails or misleads; [gdscript.md](gdscript.md) lists what changed.
- `rotation` is in radians; `rotation_degrees` takes degrees. Up is +Y, forward is -Z, one unit is one meter.
- Movement belongs in `_physics_process(delta)`: set `velocity`, then call `move_and_slide()` without arguments.
- A physics body needs a `CollisionShape3D` child with a shape, or it falls through the floor and detects nothing.
- A 3D scene needs its own `DirectionalLight3D` and `WorldEnvironment`: the editor's preview sun and sky do not exist
  in the game.
- The game keeps running between tool calls, which come seconds apart: a jump is over before the next call. Read
  short moments inside `game_input` with a `read` step, or pause with `game_pause`; `game_input`, `game_wait` and
  `game_step` then play the game by exact physics frames and pause it again. Calls sent in one message may run one
  after another, so a `game_wait` sent with a `game_input` does not watch it.
- Check 3D work in numbers first (`node_get_bounds`, properties), then look from several angles, such as
  `views: ["front", "top", "iso"]`; one picture of a 3D scene misleads.
- Keep game logic in methods that tests and tools can call, such as `dash()` or `take_damage(amount)`, rather than
  inside input handling.

## Details

- [gdscript.md](gdscript.md): GDScript 4 syntax, typing, signals, and the Godot 3 habits to avoid. Read it before
  writing scripts when you are unsure of the syntax.
- [3d.md](3d.md): axes, transforms, character controllers, cameras, collisions, lighting and scale. Read it before
  building 3D scenes or movement.
- [testing.md](testing.md): GUT tests and `test_run`, and a bug that the user plays, recorded with
  `game_record_input` and replayed. Read it before writing or running tests.
- [ui.md](ui.md): containers, anchors, HUDs, themes, focus, pause menus, and how to check a UI. Read it before
  building menus or a HUD.
- [ci.md](ci.md): a GitHub Actions workflow that downloads Godot, runs the tests of the project and exports a
  build. Read it before setting up continuous integration.
