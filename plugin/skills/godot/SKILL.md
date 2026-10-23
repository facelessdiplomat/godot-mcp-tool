---
name: godot
description: Build and change a Godot 4 game in 3D with GDScript through the godot MCP tools, from scripts and scenes to running, testing and checking the game. Use it whenever you work on a Godot project with these tools.
---

# Godot 4 game development with the godot MCP tools

The godot tools drive the Godot editor and the running game. Work in the loop below; GDScript 4, 3D and testing
are described in the files linked at the end.

## Start of a session

1. `godot_status`: is the editor connected? If not, `editor_launch` starts it.
2. `project_info`: main scene, autoloads, `class_name` classes and the indentation of `.gd` files. Use that
   indentation in every script; never mix tabs and spaces. `input_map_get` lists the input actions.
3. Read before you change: `scene_get_tree` or `node_find` for node paths, `node_get_properties` for values,
   `docs_class` for any engine API you are not sure of.

## The loop: change, check, run, observe

1. **Scripts**: write `.gd` files with your own file tools, then check them with `script_validate`. After creating or
   changing scripts that scenes use, or adding a `class_name`, call `editor_rescan`.
2. **Scenes**: never edit `.tscn` or `.tres` files as text while the editor runs. Build with `scene_create` and
   `scene_batch_edit` (many changes as one Undo step; nothing changes when one of them fails), adjust with the
   `node_` tools, connect signals with `signal_connect`. Shared materials and other resources: `resource_create`,
   `resource_set_properties`.
3. **Project setup**: input actions with `input_map_set`, settings with `project_settings_set`, global singletons
   with `autoload_add`, groups with `node_set_groups`. Move or rename files and folders with `filesystem_move`, never
   with shell commands: it updates the scenes, resources and settings that use them and lists the scripts to change.
   Before deleting a file, check with `resource_find_usages` that nothing uses it.
4. **Save** with `scene_save`. Changes stay unsaved until then; `game_run` saves first, but `test_run` reads the files
   on disk.
5. **Run** with `game_run` and read errors with `game_get_output`. A ⚠ line in any result means new errors: read them
   before you go on.
6. **Observe** the running game: `game_input` for actions, keys and the mouse; `game_wait` for a state such as
   `is_on_floor()`; `game_get_properties` for values, getters included; `node_get_bounds` for placement and scale;
   `game_screenshot`, with `views` for 3D; `game_pause` and `game_step` for frame-exact checks; `game_performance`.
7. **Test** with GUT tests in `res://test` and `test_run`.
   To find why code misbehaves, stop the game on a line with `debug_breakpoints`, read the stack and the variables
   with `debug_state`, step with `debug_continue`, and remove the breakpoints when done.
8. **Export** with `export_project` and a preset from Project → Export, after saving; `mode: "pack"` writes only the
   game data and needs no export templates.

## Rules that prevent most mistakes

- Write Godot 4 only: `@export`, `@onready`, `await`, `signal.connect(callable)`, `CharacterBody3D`, `Node3D`. Godot 3
  code fails or misleads; [gdscript.md](gdscript.md) lists what changed.
- `rotation` is in radians; `rotation_degrees` takes degrees. Up is +Y, forward is -Z, one unit is one meter.
- Movement belongs in `_physics_process(delta)`: set `velocity`, then call `move_and_slide()` without arguments.
- A physics body needs a `CollisionShape3D` child with a shape, or it falls through the floor and detects nothing.
- A 3D scene needs its own `DirectionalLight3D` and `WorldEnvironment`: the editor's preview sun and sky do not exist
  in the game.
- Tool calls sent in one message run at the same time: read the game state in a later message than the
  `game_input` or `game_wait` it depends on.
- Check 3D work in numbers first (`node_get_bounds`, properties), then look from several angles, such as
  `views: ["front", "top", "iso"]`; one picture of a 3D scene misleads.
- Keep game logic in methods that tests and tools can call, such as `dash()` or `take_damage(amount)`, rather than
  inside input handling.

## Details

- [gdscript.md](gdscript.md): GDScript 4 syntax, typing, signals, and the Godot 3 habits to avoid. Read it before
  writing scripts when you are unsure of the syntax.
- [3d.md](3d.md): axes, transforms, character controllers, cameras, collisions, lighting and scale. Read it before
  building 3D scenes or movement.
- [testing.md](testing.md): GUT tests and `test_run`. Read it before writing or running tests.
