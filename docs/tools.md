# Tool reference

Every tool, prompt and resource of the Godot MCP Tool server, as Claude sees them. This page is generated from the
code: after changing a tool, run `npm run docs:tools` in `server/`; a unit test fails while the page is out of date.

The line under each tool says what kind of tool it is:

- *Read-only*: it reads the project, the editor or the running game and changes nothing. Read-only mode
  (`GODOT_MCP_READ_ONLY=1`) keeps only these tools.
- *Makes changes*: it changes the project, the editor or the running game.
- *Loaded at the start*: Claude has it from the first message; Claude Code loads the other tools when a task needs
  them.
- *Off by default*: one of the unsafe tools. They need `GODOT_MCP_UNSAFE=1` and, in the editor,
  Project → Tools → Godot MCP Tool → Allow Unsafe Tools in This Project.
- *Claude Code asks before every call*: the user confirms each call, as for the unsafe tools and for a tool that
  downloads code.

## Contents

- [Connection and editor](#connection-and-editor): `godot_status`, `editor_launch`, `editor_rescan`, `editor_screenshot`, `editor_select`, `editor_undo`, `editor_redo`, `editor_get_state`, `editor_run_script`
- [Project](#project): `project_create`, `project_info`, `project_settings_get`, `project_settings_set`, `input_map_get`, `input_map_set`, `audio_buses_get`, `audio_buses_set`, `autoload_add`, `autoload_remove`, `plugin_set_enabled`
- [Scenes and nodes](#scenes-and-nodes): `scene_create`, `scene_open`, `scene_save`, `scene_get_tree`, `scene_batch_edit`, `node_add`, `node_delete`, `node_duplicate`, `node_reparent`, `node_save_as_scene`, `node_make_local`, `node_find`, `node_get_properties`, `node_get_bounds`, `scene_raycast`, `node_snap_to_floor`, `node_add_collision`, `node_set_properties`, `gridmap_get_cells`, `gridmap_set_cells`, `tilemap_get_cells`, `tilemap_set_cells`, `signal_list`, `signal_connect`, `signal_disconnect`, `node_set_groups`, `scene_close`, `node_call_method`
- [Resources and files](#resources-and-files): `user_data_get`, `resource_create`, `resource_get`, `resource_set_properties`, `tileset_add_atlas`, `resource_find_usages`, `filesystem_move`, `asset_import_settings_get`, `asset_import_settings_set`, `filesystem_delete`, `user_data_delete`
- [Animation and navigation](#animation-and-navigation): `navigation_bake`, `animation_get`, `animation_set`, `animation_delete`, `animation_tree_get`, `animation_tree_set`
- [Scripts, tests and exports](#scripts-tests-and-exports): `script_rename_symbol`, `script_validate`, `test_install_framework`, `test_run`, `export_preset_add`, `export_project`
- [The running game](#the-running-game): `game_run`, `game_stop`, `game_get_output`, `game_get_tree`, `game_get_properties`, `game_set_properties`, `game_wait`, `game_input`, `game_screenshot`, `game_pause`, `game_step`, `game_performance`, `game_eval`
- [Debugging](#debugging): `debug_breakpoints`, `debug_state`, `debug_continue`
- [Engine reference](#engine-reference): `docs_class`, `docs_search`
- [Prompts](#prompts)
- [Resources](#resources)

## Connection and editor

### `godot_status`

**Godot status.** Check the connection to Godot: which project is used, whether the Godot editor with the "Godot MCP Tool" plugin is connected, and which Godot executable and version are available. Call it first when another Godot tool reports a connection problem.

*Read-only · loaded at the start*

No parameters.

### `editor_launch`

**Start the editor.** Start the Godot editor for the project and wait until its "Godot MCP Tool" plugin connects, so the editor tools work. Use it when godot_status says the editor is not running. The editor keeps running after this session; it does nothing when the editor is already connected.

*Makes changes*

- `headless`: boolean. Start the editor without a window, as on a server; screenshots need a window. Default: with a window, or without one when the server runs with GODOT_MCP_HEADLESS=1.

### `editor_rescan`

**Rescan project files.** Make the editor pick up files changed outside it, such as scripts, scenes or assets written to disk and GDExtension libraries rebuilt by a native build: reload the rebuilt GDExtensions, rescan the project, import new assets and reload changed scripts, as the editor does when its window gets focus. Call it after writing files or rebuilding a GDExtension, before using them in scenes or validating scripts that use them.

*Makes changes · loaded at the start*

No parameters.

### `editor_screenshot`

**Editor screenshot.** Render the 3D scene open in the editor from the editor camera or from given views, without the grid and gizmos; the editor camera stays where it is. Check placement and scale from more than one side, such as ["front", "top", "iso"]. With animation, render the poses of an animation at several times, such as the steps of a walk cycle. A UI or 2D scene, such as a HUD or a menu, renders as the game window would show it, at the window size of the project or at given sizes, such as 16:9 and 4:3 side by side. The lighting of 3D scenes is the editor preview, so check the final look with game_screenshot. Needs the editor with a window.

*Read-only*

- `views`: list of 1 to 6 items. Render the 3D scene from these angles instead of the editor camera, up to 6 in one labelled image: a preset "front" (from +Z), "back", "left" (from -X), "right", "top" or "iso", framed on the whole scene; {"preset": "front", "target": "Player"} to frame one node; or {"position": [0, 8, 12], "look_at": [0, 0, 0]} for a camera at a point. Each view also takes "fov" and "label". Each item is one of:
  - "front", "back", "left", "right", "top" or "iso".
  - an object with:
    - `preset` (required): "front", "back", "left", "right", "top" or "iso".
    - `target`: string. A node to frame instead of the whole scene, such as "Player".
    - `fov`: number from 1 to 179. Vertical field of view in degrees. Default: 50.
    - `label`: string. Caption of the view in the image.
  - an object with:
    - `position` (required): list of 3 numbers. Camera position [x, y, z] in world coordinates.
    - `look_at`: list of 3 numbers. The point the camera looks at. Default: the center of target, or of the whole scene.
    - `target`: string. A node to frame instead of the whole scene, such as "Player".
    - `fov`: number from 1 to 179. Vertical field of view in degrees. Default: 50.
    - `label`: string. Caption of the view in the image.
- `animation`: object. Render the poses of an animation at given times without running the game, one labelled image per time in one picture, from the editor camera or from one given view. Method calls and sounds of the animation stay silent, and the animated values are put back afterwards. It has:
  - `player` (required): string. Path of the AnimationPlayer relative to the scene root, such as "Hero/AnimationPlayer".
  - `name` (required): string. The animation to pose, such as "walk".
  - `times`: list of numbers, 1 to 6. Seconds from the start of the animation to pose the scene at. Default: four times spread over the animation, such as 0, 0.25, 0.5 and 0.75 of a looping one.
- `sizes`: list of arrays, 1 to 6. For a UI or 2D scene, the window sizes to render it at, such as [[1920, 1080], [1440, 1080]] for 16:9 and 4:3 in one labelled image; the layout follows the stretch mode and aspect of the project. Default: the window size of the project.
- `max_size`: integer from 256 to 2560, default `1280`. The longest side of the image in pixels. Default: 1280.
- `format`: "png" or "jpeg", default `"png"`. png (default), or jpeg for a smaller file.

### `editor_select`

**Select in the editor.** Select nodes in the scene tree of the editor, or a file in its FileSystem dock, to show the user what you are talking about; the inspector shows what is selected. Changes nothing in the project.

*Makes changes*

- `nodes`: list of strings. Paths of the nodes to select in the scene tree, such as ["Player", "Player/Camera"].
- `scene`: string. The scene of the nodes, as a res:// path; the editor switches to it. Default: the scene open in the editor.
- `file`: string. A file or folder to select in the FileSystem dock instead, such as "res://materials/ice.tres".

### `editor_undo`

**Undo scene changes.** Take back the last actions in a scene's Undo history, as Ctrl+Z in the editor does, and name them. Every change these tools make is one action named "MCP: …"; by default only those are taken back, and it stops at an action of the user. Redo them with editor_redo.

*Makes changes*

- `count`: integer from 1 to 20, default `1`. How many actions to step through, newest first. Default: 1.
- `include_user_actions`: boolean, default `false`. Also step through actions that the user made in the editor. Default: false, so only the actions of these tools, named "MCP: …", are taken back or done again.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `editor_redo`

**Redo scene changes.** Do again the actions that editor_undo or the user took back in a scene, as Ctrl+Shift+Z in the editor does, and name them. By default only actions of these tools, named "MCP: …", are done again.

*Makes changes*

- `count`: integer from 1 to 20, default `1`. How many actions to step through, newest first. Default: 1.
- `include_user_actions`: boolean, default `false`. Also step through actions that the user made in the editor. Default: false, so only the actions of these tools, named "MCP: …", are taken back or done again.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `editor_get_state`

**What the editor shows.** Show what the user is looking at in the Godot editor: the scene on screen and the main screen (3D, 2D or Script), the nodes selected in the Scene dock, the files selected in the FileSystem dock, the script open in the script editor with the line of its caret and the selected text, and the open scenes. Use it when the user says "this node", "the selected object", "this script" or "here".

*Read-only*

No parameters.

### `editor_run_script`

**Run code in the editor.** Run GDScript code inside the editor for what no other tool covers, such as one change across many nodes or a question about the editor itself. The code can do anything the editor can, files included; its changes are not recorded for Undo, and scenes stay unsaved until scene_save. Errors come back with the lines of the code. The user confirms every call, and the editor must allow unsafe tools.

*Makes changes · off by default; Claude Code asks before every call*

- `code` (required): string. GDScript statements: the body of func run(scene: Node) -> Variant, where scene is the scene open in the editor. EditorInterface and every engine class are available. Return a value to see it, such as return scene.get_child_count().

## Project

### `project_create`

**Create project.** Create a new Godot 4 project for a game from scratch: project.godot with the name, the renderer, Jolt Physics and the window size, a main scene with a camera and a light, .gitignore, and the godot MCP addon installed with its plugin enabled. A server that started without a project works on the new one right away; start its editor with editor_launch.

*Makes changes*

- `path`: string. The folder of the project, relative to the folder Claude Code runs in or absolute, such as "capsule-walk". It is created when missing and must be empty apart from hidden files and notes (.md). Default: the folder Claude Code runs in.
- `name`: string. The name of the game. Default: the folder name in words, such as "Capsule Walk".
- `renderer`: "forward_plus", "mobile" or "gl_compatibility", default `"forward_plus"`. forward_plus (default) for desktop 3D, mobile for phones and lighter 3D, gl_compatibility for the web and old hardware.
- `window_size`: list of 2 values. The window size [width, height] in pixels. Default: [1152, 648].

### `project_info`

**Project overview.** Summarize the Godot project: name, main scene, renderer, 3D physics engine, window size, autoloads, enabled plugins, global classes (class_name), the indentation style of .gd files and the top-level folders. Call it once when starting work on a project.

*Read-only · loaded at the start*

No parameters.

### `project_settings_get`

**Read project settings.** Read project settings (project.godot) by full name or by prefix. Pass names, prefix or both. Unknown names come back with similar existing names.

*Read-only*

- `names`: list of strings. Full setting names, such as ["application/run/main_scene", "display/window/size/viewport_width"].
- `prefix`: string. Read every setting whose name starts with this, such as "display/window/".

### `project_settings_set`

**Change project settings.** Change project settings and save project.godot, for example the main scene (application/run/main_scene) or the window size. Each value is read back; the result lists what applied and the previous values, so the change can be reverted.

*Makes changes*

- `values` (required): object that maps names to values. Setting names mapped to new values, such as {"application/run/main_scene": "res://levels/arena.tscn"}. Values use the same formats as node properties.

### `input_map_get`

**Input actions.** List the input actions of the project (Project Settings → Input Map) with their keys, mouse buttons and joypad events. The built-in ui_ actions are left out unless include_builtin is true.

*Read-only · loaded at the start*

- `actions`: list of strings. Actions to show, such as ["move_forward", "jump"]. Default: every action of the project.
- `include_builtin`: boolean, default `false`. Also list the built-in ui_ actions, such as ui_accept.

### `input_map_set`

**Change input actions.** Create, change or remove input actions of the project and save project.godot. Give each action its full list of events; scripts then read it with Input.is_action_pressed("move_forward"). A game that is already running keeps its old actions until it starts again.

*Makes changes*

- `actions` (required): object that maps names to values. Action names mapped to their full list of events, such as {"move_forward": ["W", "Up"], "jump": ["Space", {"type": "joypad_button", "button": "a"}]}. Events: key names such as "W", "Space", "Up" or "Ctrl+S"; {"type": "mouse_button", "button": "left"}; {"type": "joypad_button", "button": "a"}; {"type": "joypad_motion", "axis": "left_y", "direction": -1}. Use {"events": [...], "deadzone": 0.3} to set the deadzone, and null to remove an action.

### `audio_buses_get`

**Read audio buses.** Read the audio bus layout of the project, as the Audio panel of the editor shows it: each bus in order with its volume in dB, the bus it sends to, mute, solo, bypass and its effects, and the file the layout is saved in. Players such as AudioStreamPlayer pick a bus by name with their "bus" property. Works without the editor.

*Read-only*

No parameters.

### `audio_buses_set`

**Change audio buses.** Add, change and remove buses of the audio bus layout of the project, as the Audio panel of the editor does, and save the layout file at once, so that the game starts with them: such as a Music and an Effects bus, each with its own volume, both sending to Master. Then pick the bus of each player with node_set_properties, such as {"bus": "Music"}; a player whose bus does not exist plays on Master.

*Makes changes*

- `buses`: list of items. Buses to add or change, in order; settings that are left out keep their value. Example: [{"name": "Music", "volume_db": -6}, {"name": "Effects"}]. Each item has:
  - `name` (required): string. The bus to add or change, such as "Music". A new bus is added after the others.
  - `volume_db`: number. The volume in decibels: 0 leaves the sound as it is, -6 is about half as loud, -80 silent.
  - `send`: string. The bus that this one sends its sound to, which must come before it in the layout. Default for a new bus: "Master".
  - `mute`: boolean. Silence the bus.
  - `solo`: boolean. Silence every bus that is not solo.
  - `bypass_effects`: boolean. Let the sound through without the effects of the bus.
- `remove`: list of strings. Buses to remove by name. Master stays.

### `autoload_add`

**Add autoload.** Register a script or scene as an autoload: Godot creates it when the game starts and keeps it as a global node that every script reaches by its name, such as GameState.score. Use it for game-wide state, settings and managers. Saves project.godot at once.

*Makes changes*

- `name` (required): string. The global name of the autoload that scripts use, such as "GameState".
- `path` (required): string. The script or scene to create when the game starts, as a res:// path, such as "res://autoload/game_state.gd". A script must extend Node.

### `autoload_remove`

**Remove autoload.** Remove an autoload from the project and save project.godot. Its script or scene file stays; scripts that use the autoload name fail until they are changed.

*Makes changes*

- `name` (required): string. The global name of the autoload that scripts use, such as "GameState".

### `plugin_set_enabled`

**Enable plugin.** Turn an editor plugin of res://addons on or off, as Project Settings → Plugins does: in the running editor, or in project.godot when no editor runs, so that the editor loads it when it starts. Plugins add tools to the editor, such as a test runner; their autoloads and custom node types come with them.

*Makes changes*

- `plugin` (required): string. The plugin, by its folder in res://addons, such as "gut", or by its plugin.cfg, such as "res://addons/gut/plugin.cfg".
- `enabled`: boolean, default `true`. true (default) turns the plugin on, false turns it off.

## Scenes and nodes

### `scene_create`

**Create scene.** Create a new scene file with a root node, save it and open it in the editor, so the scene and node tools work on it next. A 3D level usually has a "Node3D" root; pass a res://….tscn path as root_type to inherit from another scene.

*Makes changes*

- `path` (required): string. Where to save the new scene, such as "res://levels/arena.tscn". The file must not exist yet; missing folders are created.
- `root_type` (required): string. Type of the root node: an engine class such as "Node3D", a class_name from the project, or a res://….tscn path to create a scene inherited from it.
- `root_name`: string. Name of the root node. Default: the file name in PascalCase, so "arena.tscn" gets "Arena".

### `scene_open`

**Open scene.** Open a scene in the editor and make it the current scene, which the scene and node tools use when no scene is given. Tools that change a scene open it themselves, so this is mainly for choosing the default scene or showing a scene to the user.

*Makes changes*

- `path` (required): string. The scene to open, such as "res://levels/arena.tscn", or "main" for the main scene of the project.

### `scene_save`

**Save scene.** Save scenes from the editor to disk: the current scene, a given scene, or all open scenes. Changes made with the scene and node tools stay unsaved until then, as in the editor. Save when a logical change is complete. Refuses with a conflict when a script changed on disk while the editor has unsaved changes to it.

*Makes changes · loaded at the start*

- `scene`: string. The scene to save, as a res:// path or "main" for the main scene of the project. Default: the scene currently open in the editor.
- `all`: boolean, default `false`. Save every open scene instead of one.

### `scene_get_tree`

**Scene tree.** Show the node tree of a scene as compact text: node names and types, attached scripts, instanced scenes and groups. Use it before changing a scene to learn the node paths that the node tools take. Reads the scene open in the editor by default, or any scene by its res:// path. The nodes inside an instanced scene are listed when its Editable Children is on, or for every instance with expand_instances.

*Read-only · loaded at the start*

- `scene`: string. The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.
- `max_depth`: integer from 0 to 64, default `8`. How many levels below the root to show.
- `max_nodes`: integer from 1 to 2000, default `200`. The most nodes to list; hidden children are counted.
- `expand_instances`: boolean. Also include the nodes inside instanced scenes, such as "Enemy2/Mesh", which node_set_properties changes for that instance only. Default: only the instances themselves, and the nodes of instances whose Editable Children is on.

### `scene_batch_edit`

**Edit scene in one step.** Apply many scene changes in one call and as one Undo step: add, delete, change, move and duplicate nodes, set their groups, connect and disconnect signals. Later operations can use the nodes that earlier ones added or renamed. If any operation fails or any property is rejected, nothing is changed and the error names the operation; a value that the engine adjusts, such as a size raised to the minimum of a control, is kept and reported. Use it to build or rework a scene.

*Makes changes · loaded at the start*

- `operations` (required): list of 1 to 100 items. The changes in order. Each is {"op": a tool name, ...the parameters of that tool except scene}, such as {"op": "node_add", "type": "CharacterBody3D", "name": "Player"}, {"op": "node_set_properties", "path": "Player", "properties": {"position": [0, 1, 0]}} or {"op": "signal_connect", "from": "Start", "signal": "pressed", "method": "_on_start_pressed"}. op is node_add, node_delete, node_set_properties, node_set_groups, node_reparent, node_duplicate, node_save_as_scene, node_make_local, node_add_collision, signal_connect or signal_disconnect. Each item is one of:
  - an object with:
    - `op` (required): "node_add".
    - `type` (required): string. What to add: an engine class such as "MeshInstance3D", a class_name from the project, or a scene to instance such as "res://props/crate.tscn".
    - `name`: string. Name of the new node. Default: the type name; a taken name gets a number.
    - `parent`: string, default `"."`. Path of the parent node relative to the scene root. Default: "." (the root).
    - `index`: integer, at least 0. Position among the children of the parent. Default: after the last child.
    - `properties`: object that maps names to values. Property names mapped to values, in the formats of node_set_properties, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh"}}.
  - an object with:
    - `op` (required): "node_delete".
    - `paths` (required): list of strings, at least 1. Paths of the nodes to delete, relative to the scene root, such as ["Enemies/Goblin"]. Children go with their parent.
  - an object with:
    - `op` (required): "node_set_properties".
    - `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
    - `properties` (required): object that maps names to values. Property names mapped to values, in the formats of node_set_properties, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh"}}.
  - an object with:
    - `op` (required): "node_set_groups".
    - `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
    - `add`: list of strings, default `[]`. Groups to add the node to, such as ["enemies", "damageable"].
    - `remove`: list of strings, default `[]`. Groups to take the node out of.
  - an object with:
    - `op` (required): "node_reparent".
    - `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
    - `parent`: string. Path of the new parent, such as "Props"; "." is the scene root. Default: the current parent.
    - `name`: string. A new name for the node.
    - `index`: integer, at least 0. The new position among the children of the parent; 0 is the first.
    - `keep_global_transform`: boolean, default `true`. Keep a 3D node where it is in the world when its parent changes. Default: true.
  - an object with:
    - `op` (required): "node_duplicate".
    - `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
    - `name`: string. Name of the copy. Default: the name of the original with a number, such as "Crate2".
    - `parent`: string. Put the copy under this node instead of right after the original.
    - `properties`: object that maps names to values. Property names mapped to values, in the formats of node_set_properties, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh"}}.
  - an object with:
    - `op` (required): "node_save_as_scene".
    - `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
    - `file` (required): string. The new scene file, such as "res://enemies/enemy.tscn". It must not exist yet; missing folders are created.
  - an object with:
    - `op` (required): "node_make_local".
    - `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
  - an object with:
    - `op` (required): "node_add_collision".
    - `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
    - `shape` (required): "trimesh", "convex", "simplified_convex", "multiple_convex", "box", "capsule", "cylinder" or "sphere". trimesh follows every triangle and suits static level geometry; convex and simplified_convex wrap the mesh in one convex hull; multiple_convex splits it into up to 32 hulls for concave moving objects; box, capsule, cylinder and sphere fit a primitive to the mesh.
    - `placement`: "static_body" or "sibling", default `"static_body"`. static_body (default) adds a StaticBody3D child with the shapes, so that bodies cannot pass through the mesh; sibling adds CollisionShape3D nodes next to the mesh, for a mesh that is already part of a physics body.
    - `axis`: "longest", "x", "y" or "z". The axis of a capsule or a cylinder fitted to a mesh that is not one. Default: the longest side of the mesh.
  - an object with:
    - `op` (required): "signal_connect".
    - `from` (required): string. Path of the node that emits the signal, such as "Button" or "Door/Area".
    - `signal` (required): string. The signal, such as "pressed" or "body_entered".
    - `to`: string, default `"."`. Path of the node whose method is called. Default: "." (the scene root).
    - `method` (required): string. The method to call, such as "_on_button_pressed".
    - `binds`: list of values. Extra values passed to the method after the signal arguments, such as ["door_a"].
    - `deferred`: boolean, default `false`. Call the method at the end of the frame instead of at once.
    - `one_shot`: boolean, default `false`. Disconnect after the first call.
  - an object with:
    - `op` (required): "signal_disconnect".
    - `from` (required): string. Path of the node that emits the signal, such as "Button" or "Door/Area".
    - `signal` (required): string. The signal, such as "pressed" or "body_entered".
    - `to`: string, default `"."`. Path of the node whose method is called. Default: "." (the scene root).
    - `method` (required): string. The method to call, such as "_on_button_pressed".
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `node_add`

**Add node.** Add a node to a scene: an engine class, a class_name from the project, or an instance of another scene, with its properties set at once. One Undo step in the editor; the scene stays unsaved until scene_save. The result reports which properties applied.

*Makes changes*

- `type` (required): string. What to add: an engine class such as "MeshInstance3D", a class_name from the project, or a scene to instance such as "res://props/crate.tscn".
- `name`: string. Name of the new node. Default: the type name; a taken name gets a number.
- `parent`: string, default `"."`. Path of the parent node relative to the scene root. Default: "." (the root).
- `index`: integer, at least 0. Position among the children of the parent. Default: after the last child.
- `properties`: object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. A path changes one part only: "mesh:size" a property of the node's own mesh, "position:y" one coordinate. Every value is read back after it is set.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `node_delete`

**Delete nodes.** Delete nodes and their children from a scene as one Undo step. If any path is not found, nothing is deleted. The scene root and nodes inside instanced scenes cannot be deleted here.

*Makes changes*

- `paths` (required): list of strings, at least 1. Paths of the nodes to delete, relative to the scene root, such as ["Enemies/Goblin"]. Children go with their parent.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `node_duplicate`

**Duplicate node.** Duplicate a node with its children, groups, scripts and signal connections, as one Undo step. The copy goes right after the original, or under parent; properties are set on the copy, such as {"position": [4, 0, 0]}.

*Makes changes*

- `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
- `name`: string. Name of the copy. Default: the name of the original with a number, such as "Crate2".
- `parent`: string. Put the copy under this node instead of right after the original.
- `properties`: object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. A path changes one part only: "mesh:size" a property of the node's own mesh, "position:y" one coordinate. Every value is read back after it is set.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `node_reparent`

**Move or rename node.** Move a node to another parent, rename it, or change its place among its siblings, as one Undo step; its children move with it. 3D nodes keep their place in the world unless keep_global_transform is false. Node paths that pointed at the moved nodes, such as a RemoteTransform3D remote_path or an exported NodePath, are updated.

*Makes changes*

- `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
- `parent`: string. Path of the new parent, such as "Props"; "." is the scene root. Default: the current parent.
- `name`: string. A new name for the node.
- `index`: integer, at least 0. The new position among the children of the parent; 0 is the first.
- `keep_global_transform`: boolean, default `true`. Keep a 3D node where it is in the world when its parent changes. Default: true.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `node_save_as_scene`

**Save branch as scene.** Save a node and its children as a scene file of their own and put an instance of that scene in their place, as Save Branch as Scene in the editor does: one Undo step, and the instance stays where the node was. Use it to turn something built in a level, such as an enemy, into a scene that other levels can instance with node_add. The new file is written at once; the changed scene stays unsaved until scene_save.

*Makes changes*

- `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
- `file` (required): string. The new scene file, such as "res://enemies/enemy.tscn". It must not exist yet; missing folders are created.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `node_make_local`

**Make instance local.** Turn an instance of another scene into nodes of this scene, as Make Local in the editor does, as one Undo step: its nodes stop following changes to the instanced scene file and can then be moved, deleted and changed here like any other node. To change one instance but keep it linked to its scene, set properties of its nodes with node_set_properties instead.

*Makes changes*

- `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `node_find`

**Find nodes.** Find nodes in a scene by name, type, group or attached script; every given criterion must match. Returns their paths for the other node tools. The nodes inside an instanced scene are searched when its Editable Children is on, or in every instance with expand_instances.

*Read-only*

- `name`: string. Part of the node name, or a pattern with * and ?, such as "Enemy*". Case does not matter.
- `type`: string. A node class or class_name. Subclasses match too, so "Light3D" finds every light.
- `group`: string. A group the node belongs to, such as "enemies".
- `script`: string. The attached script, as a res:// path or a file name such as "player.gd".
- `scene`: string. The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.
- `max_results`: integer from 1 to 500, default `50`. The most nodes to list.
- `expand_instances`: boolean. Also include the nodes inside instanced scenes, such as "Enemy2/Mesh", which node_set_properties changes for that instance only. Default: only the instances themselves, and the nodes of instances whose Editable Children is on.

### `node_get_properties`

**Node properties.** Read the properties of a node: those that differ from their defaults, or the ones named. Each value comes with its type, in Godot syntax; enums list their options. Use it to check a node before or after changing it.

*Read-only · loaded at the start*

- `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
- `names`: list of strings. Properties to read, such as ["position", "mesh"], or paths into a resource or a value, such as "mesh:size" or "position:y". Default: every property whose value differs from its default.
- `include_defaults`: boolean, default `false`. Without names, also list properties at their default values. The list gets long.
- `scene`: string. The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.

### `node_get_bounds`

**Node bounds.** Measure the box that a 3D node and its children take up in world coordinates: center, size and corners, from its meshes and CSG shapes, or from its collision shapes when it has none. For a Control or a 2D node, measure its rectangle in canvas pixels, from controls, sprites, polygons, lines and tile maps, or from 2D collision shapes; a control also says whether it fits the window of the project. Use it to check placement and scale, such as whether a crate rests on the floor, a door is wide enough for the player or a health bar stays on screen.

*Read-only*

- `path` (required): string. Path of the node relative to the scene root, such as "Level/Crate"; "." measures the whole scene. With in_game, a path in the running game, such as "Player".
- `scene`: string. The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.
- `in_game`: boolean, default `false`. Measure the node in the running game instead, where it may have moved. Needs a game started from the editor.

### `scene_raycast`

**Cast a ray.** Cast a ray through a 3D scene and return the first thing it hits: the position, the surface normal, the distance and the node, whether a collision shape or a visible mesh without collision. Straight down by default, to find the ground under a point; between two points to check a line of sight, such as whether an enemy sees the player. With in_game, cast in the running game.

*Read-only*

- `from` (required): list of 3 values. Where the ray starts, [x, y, z] in world coordinates, such as [0, 10, 0].
- `to`: list of 3 values. Where the ray ends. Default: 1000 m straight down from "from", to find the ground under a point.
- `exclude`: list of strings. Nodes the ray passes through, with their children, such as the node being placed.
- `in_game`: boolean, default `false`. Cast in the running game instead, against its current state. Needs a game started with game_run.
- `scene`: string. The scene to cast in, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `node_snap_to_floor`

**Place on the floor.** Move 3D nodes straight down or up until each touches what is below it, a collision shape or a visible mesh, as one Undo step. A node stops where the first point of its collision shapes, or of its meshes when it has none, meets the surface, so nothing sinks into the ground and a node tilted like a slope lies flat on it. With align, each node is first turned so that its up axis follows the surface under it. Use it to put props on uneven ground, on slopes or on top of other objects.

*Makes changes*

- `paths` (required): list of strings, at least 1. The 3D nodes to place, such as ["Crate", "Props/Barrel"].
- `align`: boolean. First turn each node so that its up axis follows the surface under it, such as a crate on a slope, then place it. Default: false, which keeps the rotation.
- `scene`: string. The scene to change, as a res:// path or "main"; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `node_add_collision`

**Add collision from a mesh.** Give a MeshInstance3D a collision built from its mesh, as Mesh → Create Collision Shape in the editor does, as one Undo step, so that players and other bodies cannot pass through it. The result compares the size of the collision with the size of the mesh. CSG nodes take use_collision instead, and imported models their import settings.

*Makes changes*

- `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
- `shape` (required): "trimesh", "convex", "simplified_convex", "multiple_convex", "box", "capsule", "cylinder" or "sphere". trimesh follows every triangle and suits static level geometry; convex and simplified_convex wrap the mesh in one convex hull; multiple_convex splits it into up to 32 hulls for concave moving objects; box, capsule, cylinder and sphere fit a primitive to the mesh.
- `placement`: "static_body" or "sibling", default `"static_body"`. static_body (default) adds a StaticBody3D child with the shapes, so that bodies cannot pass through the mesh; sibling adds CollisionShape3D nodes next to the mesh, for a mesh that is already part of a physics body.
- `axis`: "longest", "x", "y" or "z". The axis of a capsule or a cylinder fitted to a mesh that is not one. Default: the longest side of the mesh.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `node_set_properties`

**Set node properties.** Set several properties of a node as one Undo step, including script (a res://….gd path) and resources (a res:// path, or {"new": "Class", …} to create one). Every value is read back: the result lists what applied, what was rejected and why, and what the engine changed, for example by clamping. A node inside an instanced scene, such as "Enemy2/Mesh", changes for that instance only: Editable Children of the instance is turned on, as in the editor, so that the change is saved with this scene.

*Makes changes*

- `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
- `properties` (required): object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. A path changes one part only: "mesh:size" a property of the node's own mesh, "position:y" one coordinate. Every value is read back after it is set.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `gridmap_get_cells`

**Read GridMap cells.** Read the cells of a GridMap: the blocks of its mesh library by name and number, how many cells use each, the box the cells fill and the cells themselves with their block and orientation, ordered by y, then z, then x. Use it to check a level built of blocks, whole or one box at a time. Works without the editor when "scene" is given.

*Read-only*

- `path` (required): string. Path of the GridMap node relative to the scene root, such as "Level/Ground".
- `from`: list of 3 values. One corner of the box of cells to read, [x, y, z] in cells, such as [-4, 0, -4]. Give "to" with it. Default: every cell.
- `to`: list of 3 values. The opposite corner of the box, included, such as [3, 0, 3].
- `max_cells`: integer from 1 to 10000, default `100`. The most cells to list; the counts cover every cell.
- `scene`: string. The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.

### `gridmap_set_cells`

**Paint GridMap cells.** Put blocks of the mesh library of a GridMap on its cells, or erase them, as one Undo step: whole boxes of cells, such as a floor or a wall, and single cells, with blocks named as in the library. Cells are whole numbers on the grid, not meters: cell [x, y, z] sits at [x, y, z] times cell_size. Read the blocks and cells with gridmap_get_cells first.

*Makes changes*

- `path` (required): string. Path of the GridMap node relative to the scene root, such as "Level/Ground".
- `boxes`: list of items. Boxes of cells to fill with one block each, in order, so that a later box paints over an earlier one: a floor from [-4, 0, -4] to [3, 0, 3] is 64 cells; a ring of walls is a box of walls with a floor box inside it. Each item has:
  - `from` (required): list of 3 values. One corner, [x, y, z] in cells.
  - `to` (required): list of 3 values. The opposite corner, included.
  - `item` (required): string, integer, at least 0 or null. The block: its name in the mesh library, such as "Wall", or its number; null erases the cells.
  - `orientation`: integer from 0 to 23. How the block is turned, as an orthogonal index from 0 to 23. Turned around y: 0 for 0°, 16 for 90°, 10 for 180°, 22 for 270°. Default: 0, as in the mesh library.
- `cells`: list of items. Single cells to set after the boxes. Each item has:
  - `position` (required): list of 3 values. The cell, [x, y, z] in cells.
  - `item` (required): string, integer, at least 0 or null. The block: its name in the mesh library, such as "Wall", or its number; null erases the cells.
  - `orientation`: integer from 0 to 23. How the block is turned, as an orthogonal index from 0 to 23. Turned around y: 0 for 0°, 16 for 90°, 10 for 180°, 22 for 270°. Default: 0, as in the mesh library.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `tilemap_get_cells`

**Read TileMapLayer cells.** Read the cells of a TileMapLayer: its TileSet with the tile size, the physics layers and each source with its texture, tiles and how many of them collide; how many cells use each tile, the rectangle the cells fill and the cells themselves, ordered by y, then x. Use it to check a 2D level of tiles, whole or one rectangle at a time. Works without the editor when "scene" is given.

*Read-only*

- `path` (required): string. Path of the TileMapLayer node relative to the scene root, such as "Level/Ground".
- `from`: list of 2 values. One corner of the rectangle of cells to read, [x, y] in cells, such as [0, 0]. Give "to" with it. Default: every cell.
- `to`: list of 2 values. The opposite corner of the rectangle, included, such as [29, 15].
- `max_cells`: integer from 1 to 10000, default `100`. The most cells to list; the counts cover every cell.
- `scene`: string. The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.

### `tilemap_set_cells`

**Paint TileMapLayer cells.** Paint tiles of the TileSet of a TileMapLayer on its cells, or erase them, as one Undo step: whole rectangles, such as the ground or a wall, and single cells, each tile given by its [column, row] in the atlas of its source. Cells are whole numbers on the grid, not pixels: cell [x, y] sits at [x, y] times the tile size, and y grows downward. Read the tiles and the cells with tilemap_get_cells first.

*Makes changes*

- `path` (required): string. Path of the TileMapLayer node relative to the scene root, such as "Level/Ground".
- `rects`: list of items. Rectangles of cells to fill with one tile each, in order, so that a later one paints over an earlier one: ground 30 tiles wide is {"from": [0, 10], "to": [29, 10], "atlas": [0, 0]}. Each item has:
  - `from` (required): list of 2 values. One corner, [x, y] in cells.
  - `to` (required): list of 2 values. The opposite corner, included.
  - `atlas` (required): list of 2 values or null. The tile as [column, row] in the atlas of its source, such as [0, 0] for the first one; null erases the cells.
  - `source`: integer, at least 0. The source of the tile in the TileSet. Default: the only source, when the TileSet has one.
  - `alternative`: integer, at least 0. An alternative of the tile, such as a flipped copy. Default: 0, the tile itself.
- `cells`: list of items. Single cells to set after the rectangles. Each item has:
  - `position` (required): list of 2 values. The cell, [x, y] in cells.
  - `atlas` (required): list of 2 values or null. The tile as [column, row] in the atlas of its source, such as [0, 0] for the first one; null erases the cells.
  - `source`: integer, at least 0. The source of the tile in the TileSet. Default: the only source, when the TileSet has one.
  - `alternative`: integer, at least 0. An alternative of the tile, such as a flipped copy. Default: 0, the tile itself.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `signal_list`

**Signals and connections.** List the signal connections saved in a scene, or every signal of one node with its arguments and connections. Use it before signal_connect to learn the signal names and the parameters a method needs.

*Read-only*

- `path`: string. A node whose signals to list with their arguments and connections, such as "Door/Area". Default: every saved connection of the scene.
- `scene`: string. The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.

### `signal_connect`

**Connect signal.** Connect a signal of a node to a method of a node in the scene, saved with the scene like a connection made in the editor, as one Undo step. The method must already exist with matching parameters; if it does not, the error names the function to add to the script.

*Makes changes*

- `from` (required): string. Path of the node that emits the signal, such as "Button" or "Door/Area".
- `signal` (required): string. The signal, such as "pressed" or "body_entered".
- `to`: string, default `"."`. Path of the node whose method is called. Default: "." (the scene root).
- `method` (required): string. The method to call, such as "_on_button_pressed".
- `binds`: list of values. Extra values passed to the method after the signal arguments, such as ["door_a"].
- `deferred`: boolean, default `false`. Call the method at the end of the frame instead of at once.
- `one_shot`: boolean, default `false`. Disconnect after the first call.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `signal_disconnect`

**Disconnect signal.** Remove a saved signal connection from a scene, as one Undo step.

*Makes changes*

- `from` (required): string. Path of the node that emits the signal, such as "Button" or "Door/Area".
- `signal` (required): string. The signal, such as "pressed" or "body_entered".
- `to`: string, default `"."`. Path of the node whose method is called. Default: "." (the scene root).
- `method` (required): string. The method to call, such as "_on_button_pressed".
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `node_set_groups`

**Set node groups.** Add a node to groups or take it out of them, as one Undo step; the groups are saved with the scene. Scripts find the nodes of a group with get_tree().get_nodes_in_group("enemies"), and node_find finds them by group.

*Makes changes*

- `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
- `add`: list of strings, default `[]`. Groups to add the node to, such as ["enemies", "damageable"].
- `remove`: list of strings, default `[]`. Groups to take the node out of.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `scene_close`

**Close scene.** Close a scene in the editor: the one named, or the one open now. A scene with unsaved changes stays open unless unsaved says to save them first or to discard them.

*Makes changes*

- `scene`: string. The scene to close, as a res:// path or "main" for the main scene of the project. Default: the scene currently open in the editor.
- `unsaved`: "save" or "discard". What to do with unsaved changes: "save" saves them first, "discard" drops them. Without it, a scene with unsaved changes stays open.

### `node_call_method`

**Call a node method.** Call a method of a node in the editor, such as look_at to aim a camera or rotate_y, when setting properties cannot express the change. The changed properties of the node are recorded as one Undo step; other effects of the method are not. The user confirms every call, and the editor must allow unsafe tools.

*Makes changes · off by default; Claude Code asks before every call*

- `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
- `method` (required): string. The method to call, such as "look_at" or "rotate_y".
- `args`: list of values, default `[]`. The arguments in order, in the formats of node_set_properties, such as [[0, 0, 0]] for a Vector3.
- `scene`: string. The scene to change, as a res:// path or "main" for the main scene of the project; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

## Resources and files

### `user_data_get`

**Read user data.** Read user://, the folder where the game keeps saved games, settings and logs: without a path, every file with its size and the time it changed; with a file, its text. Use it to check what the game saved after game_run. Works without the editor. To clear saves, delete them with user_data_delete when unsafe tools are on.

*Read-only*

- `path`: string. A file or folder in the user data, such as "user://save.json" or "saves"; the user:// prefix may be left out. Default: the whole folder, listed.
- `max_bytes`: integer from 1 to 200000, default `8000`. The most bytes of a file to show.

### `resource_create`

**Create resource.** Create a resource file (.tres) with its properties set at once and save it: a material, physics material, environment, curve, or a resource of a class of the project. Use it for resources that several nodes or scenes share and assign it to them by its res:// path; a resource that only one node uses can be created right in the node property with {"new": "Class", …} instead. The result reports which properties applied.

*Makes changes*

- `path` (required): string. Where to save the new resource, as a res:// path ending in .tres, such as "res://materials/ice.tres". Missing folders are created; an existing file is never replaced.
- `type` (required): string. The resource class: an engine class such as "StandardMaterial3D", "PhysicsMaterial", "Environment" or "Curve", or a class_name of the project that extends Resource.
- `properties`: object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. A path changes one part only: "mesh:size" a property of the node's own mesh, "position:y" one coordinate. Every value is read back after it is set.

### `resource_get`

**Read resource.** Read a resource file such as a material, physics material or environment, or an imported one such as a texture: its type, the properties that differ from their defaults or the ones named, each with its type in Godot syntax, and the files it depends on; for a texture also its size in pixels. Scenes are read with scene_get_tree instead.

*Read-only*

- `path` (required): string. The resource file, as a res:// path such as "res://materials/ice.tres".
- `names`: list of strings. Properties to read, such as ["albedo_color", "roughness"], paths such as "next_pass:albedo_color", or methods without arguments whose names start with is_, get_, has_ or can_, such as "get_length()". Default: every property whose value differs from its default.
- `include_defaults`: boolean, default `false`. Without names, also list properties at their default values. The list gets long.

### `resource_set_properties`

**Set resource properties.** Set several properties of a resource file such as a material or physics material as one Undo step and save the file, so the scenes that use it, the game and the tests see the change at once. Every value is read back: the result lists what applied, what was rejected and why, and what the engine changed. Imported files such as textures and models are changed through their import settings instead, with asset_import_settings_set.

*Makes changes*

- `path` (required): string. The resource file, as a res:// path such as "res://materials/ice.tres".
- `properties` (required): object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. A path changes one part only: "mesh:size" a property of the node's own mesh, "position:y" one coordinate. Every value is read back after it is set.

### `tileset_add_atlas`

**Add a tile atlas.** Cut a texture into tiles and add them to a TileSet as one atlas source, creating the TileSet file when it does not exist, and save it: every tile of the given size that is not empty, each with a full square collision when asked, so that bodies stand on it. This is how a 2D level of tiles starts: then give the TileSet to a TileMapLayer and paint its cells with tilemap_set_cells.

*Makes changes*

- `path` (required): string. The TileSet file to create or add to, such as "res://tiles/ground.tres".
- `texture` (required): string. The image of the tiles, such as "res://tiles.png", as the editor imported it.
- `tile_size` (required): list of 2 values. The size of one tile in pixels, [width, height], such as [32, 32]. A new TileSet takes it as its tile_size.
- `collision`: boolean. Give every tile a full square collision polygon on physics layer 0, added when the TileSet has none, so that bodies stand on the tiles. Default: false.
- `margins`: list of 2 values. Pixels to skip at the left and the top of the texture before the first tile. Default: [0, 0].
- `separation`: list of 2 values. Pixels between neighboring tiles in the texture. Default: [0, 0].

### `resource_find_usages`

**Find file usages.** Find what uses a file, or the files of a folder, before moving, renaming or deleting it: the scenes and resources that refer to it, the project settings that point at it, such as the main scene or an autoload, and the lines of scripts and shaders that name its res:// path or its UID. Code is searched as text, so paths built while the game runs are not found, and code in res://addons/ is searched only for files of addons. For a folder, uses from inside the folder are left out.

*Read-only*

- `path` (required): string. A file or folder of the project, as a res:// path such as "res://materials/ice.tres" or "res://materials".

### `filesystem_move`

**Move or rename a file.** Move or rename a file or folder of the project as the FileSystem dock does: its .import and .uid files go along, the scenes and resources that refer to it get the new path, open scenes follow, and project settings that point at it, such as the main scene or an autoload, are updated. References by UID keep working. Scripts and shaders that name the old res:// path are listed for you to change, and so are binary .scn and .res files that use it, which only the editor can rewrite. The move is not in the Undo history; move it back with filesystem_move. Refuses while a scene that it changes is open with unsaved changes.

*Makes changes*

- `from` (required): string. The file or folder to move, as a res:// path such as "res://materials/ice.tres".
- `to` (required): string. The new path, with the file or folder name, such as "res://surfaces/ice.tres", or "res://materials/frost.tres" to rename it. Missing folders are created; an existing file or folder is never replaced.

### `asset_import_settings_get`

**Read import settings.** Read how Godot imports an asset such as a glTF, FBX or .blend model, a texture or a sound: its importer options (nodes/root_scale, nodes/root_type, materials/extract, …), the settings stored for nodes of a model, and for a model the size, nodes and collision shapes of the imported scene. Check the size first: models often arrive in centimeters, such as a character 180 units tall, and need nodes/root_scale 0.01.

*Read-only*

- `path` (required): string. The imported file, as a res:// path such as "res://models/character.glb".

### `asset_import_settings_set`

**Change import settings.** Change the import settings of an asset and reimport it, so every scene that uses it gets the result. options change importer options, such as {"nodes/root_scale": 0.01} to turn centimeters into meters or {"nodes/root_type": "StaticBody3D"}; nodes give nodes of a model their own settings, such as collision with {"Body": {"generate/physics": true, "physics/shape_type": "Trimesh"}}. Primitive shapes (Box, Sphere, Cylinder, Capsule) are not fitted to the mesh: give primitive/size, primitive/radius and primitive/height in the model's own units, before root_scale, and primitive/position to move the shape from the node's origin. The result shows the size of the imported scene before and after and its collision shapes, to compare.

*Makes changes*

- `path` (required): string. The imported file, as a res:// path such as "res://models/character.glb".
- `options`: object that maps names to values. Importer options by name, as asset_import_settings_get lists them, such as {"nodes/root_scale": 0.01, "materials/extract": "Extract Once", "materials/extract_path": "res://materials/"}.
- `nodes`: object that maps names to objects. Settings for nodes of a model, keyed by node path as asset_import_settings_get lists them, such as {"Body": {"generate/physics": true, "physics/shape_type": "Capsule", "primitive/radius": 25, "primitive/height": 180}}. Settings: generate/physics, physics/body_type (StaticBody3D, RigidBody3D, Area3D), physics/shape_type (Decompose Convex, Single Convex, Trimesh, Box, Sphere, Cylinder, Capsule, Automatic), physics/layer and physics/mask (layer numbers), primitive/size, primitive/radius, primitive/height, primitive/position, primitive/rotation, generate/navmesh, generate/occluder, mesh_instance/cast_shadow, mesh_instance/layers, import/skip_import, node/node_type.

### `filesystem_delete`

**Delete files.** Delete files or folders of the project by moving them to the system trash with their .import and .uid files; the user can restore them from there. Deletes nothing while the project uses them — scenes and resources that refer to them, project settings that point at them, scripts and shaders that name their path or UID — and lists those uses instead; force: true deletes anyway, leaves those references broken and clears the project settings. Never deletes the script or scene of an autoload; remove the autoload with autoload_remove first. Deleted scenes that are open in the editor are closed, unless they have unsaved changes. The user confirms every call, and the editor must allow unsafe tools.

*Makes changes · off by default; Claude Code asks before every call*

- `paths` (required): list of strings, at least 1. The files or folders to delete, as res:// paths such as ["res://materials/old_ice.tres", "res://levels/unused"].
- `force`: boolean, default `false`. Delete even when the project uses the files, which leaves those references broken. Default: false.

### `user_data_delete`

**Delete user data.** Delete files or folders of user://, the user data of the game, such as a saved game, by moving them to the system trash, so that the next game_run starts fresh. user_data_get lists them. The user confirms every call, and the editor must allow unsafe tools.

*Makes changes · off by default; Claude Code asks before every call*

- `paths` (required): list of strings, at least 1. Files or folders in the user data of the game, such as ["user://save.json", "user://saves"]; the user:// prefix may be left out.

## Animation and navigation

### `navigation_bake`

**Bake navigation mesh.** Bake the navigation mesh of a NavigationRegion3D, or of every one in the scene, from the geometry under the region — floors and obstacles as meshes, CSG nodes or static collision shapes — as the editor's Bake NavigationMesh button does. One Undo step; the scene stays unsaved until scene_save, and the game uses the saved mesh. The result gives each region's polygon count and the area it covers, which is smaller than the floor by the agent radius; a region that gets no polygons comes with the reason, such as no geometry under it or an agent too large. Agent size and other bake settings are properties of the region's NavigationMesh: agent_radius, agent_height, agent_max_climb, agent_max_slope.

*Makes changes*

- `path`: string. Path of the NavigationRegion3D relative to the scene root, such as "Navigation". Default: every NavigationRegion3D of the scene.
- `scene`: string. The scene to bake in, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `animation_get`

**Read animations.** Read the animations of an AnimationPlayer: each animation's length, loop mode and track count, or with name the tracks of one animation with their node paths, interpolation and keys. Track paths are relative to the player's root_node, the parent of the player by default.

*Read-only*

- `player` (required): string. Path of the AnimationPlayer relative to the scene root, such as "AnimationPlayer" or "Door/AnimationPlayer".
- `name`: string. An animation to show with its tracks and keys. Default: list every animation of the player.
- `scene`: string. The scene, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `animation_set`

**Create or replace animation.** Create or replace an animation of an AnimationPlayer from tracks, as one Undo step: a value track animates one property, such as {"path": "Door:position", "keys": [{"time": 0, "value": [0, 0, 0]}, {"time": 1, "value": [0, 3, 0]}]}, with a node path relative to the parent of the player and values in the formats of node_set_properties; a method track calls methods of a node at given times, such as footsteps: {"type": "method", "path": "Walker", "keys": [{"time": 0.25, "method": "_on_footstep"}]}; an audio track plays sounds through an audio player node: {"type": "audio", "path": "Walker/Footsteps", "keys": [{"time": 0.25, "stream": "res://sounds/step.ogg"}]}. Method tracks call in the running game, not in the editor. A track the editor cannot use is rejected with the reason and the others are kept. Like the editor, it keys the current value of each newly animated property in the RESET animation, the pose that the other animations and AnimationTree blends start from; without it, a property that only some animations of a state machine animate would blend from zero. An animation plays when a script calls play("name") on the player or when the player's autoplay names it; check it in the running game with game_wait and game_get_properties.

*Makes changes*

- `player` (required): string. Path of the AnimationPlayer relative to the scene root, such as "AnimationPlayer" or "Door/AnimationPlayer".
- `name` (required): string. Name of the animation, such as "open"; "library/name" for an animation of another library than the default one.
- `length`: number, above 0. Length in seconds. Default: the time of the last key.
- `loop`: "none", "linear" or "pingpong". none (default) plays once, linear repeats, pingpong goes back and forth.
- `tracks` (required): list of at least 1 item. One track per animated property, per node whose methods are called and per audio player, each with all its keys. Each item is one of:
  - an object with:
    - `type`: "value". value (default) animates a property; "method" calls methods of a node; "audio" plays sounds through an audio player node.
    - `path` (required): string. Node and property, relative to the parent of the player: "Door:position", "Door:position:y", ".:visible" for the parent itself.
    - `keys` (required): list of at least 1 item. Each item has:
      - `time` (required): number, at least 0. Seconds from the start of the animation.
      - `value` (required): value. The value, in the formats of node_set_properties, such as [0, 3, 0] for a Vector3 or true for visible.
    - `interpolation`: "nearest", "linear", "cubic", "linear_angle" or "cubic_angle". How values blend between keys. Default: linear; linear_angle turns rotations the short way.
    - `update`: "continuous", "discrete" or "capture". continuous blends every frame, discrete changes at each key. Default: discrete for values that cannot blend, such as bool and text, continuous otherwise.
  - an object with:
    - `type` (required): "method".
    - `path` (required): string. The node whose methods are called, relative to the parent of the player, such as "Walker" or "." for the parent itself.
    - `keys` (required): list of at least 1 item. Each item has:
      - `time` (required): number, at least 0. Seconds from the start of the animation.
      - `method` (required): string. The method to call, such as "_on_footstep"; it must already exist in the script of the node.
      - `args`: list of values. Arguments in order, in the formats of node_set_properties, such as ["left"]. Default: none.
  - an object with:
    - `type` (required): "audio".
    - `path` (required): string. An AudioStreamPlayer, AudioStreamPlayer2D or AudioStreamPlayer3D, relative to the parent of the player, such as "Walker/Footsteps".
    - `keys` (required): list of at least 1 item. Each item has:
      - `time` (required): number, at least 0. Seconds from the start of the animation.
      - `stream` (required): string. The sound to play, as a res:// path such as "res://sounds/step.ogg".
      - `start_offset`: number, at least 0. Seconds cut from the start of the sound. Default: 0.
      - `end_offset`: number, at least 0. Seconds cut from the end of the sound. Default: 0.
- `scene`: string. The scene, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `animation_delete`

**Delete animation.** Delete an animation of an AnimationPlayer as one Undo step.

*Makes changes*

- `player` (required): string. Path of the AnimationPlayer relative to the scene root, such as "AnimationPlayer" or "Door/AnimationPlayer".
- `name` (required): string. Name of the animation, such as "open"; "library/name" for an animation of another library than the default one.
- `scene`: string. The scene, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `animation_tree_get`

**Read animation tree.** Read an AnimationTree: the AnimationPlayer it takes animations from, whether it is active, and for a state machine its states, the transitions between them with their conditions and expressions, and the condition parameters that scripts set.

*Read-only*

- `tree` (required): string. Path of the AnimationTree relative to the scene root, such as "AnimationTree" or "Player/AnimationTree".
- `scene`: string. The scene, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

### `animation_tree_set`

**Set up animation state machine.** Set up an AnimationTree as a state machine, as one Undo step: states that each play an animation of the AnimationPlayer or blend several by a parameter, such as walking and running by speed, and transitions between them, such as {"from": "Start", "to": "idle"} and {"from": "idle", "to": "walk", "condition": "moving", "xfade": 0.2}. It replaces the tree root; states or transitions the editor cannot use are rejected with the reason and the rest are kept. Scripts switch states by setting conditions, such as $AnimationTree.set("parameters/conditions/moving", true), or with travel("walk") on parameters/playback. In the running game, set a condition with game_set_properties on the AnimationTree and wait for a state with game_wait and the condition get("parameters/playback").get_current_node() == "walk".

*Makes changes*

- `tree` (required): string. Path of the AnimationTree relative to the scene root, such as "AnimationTree" or "Player/AnimationTree".
- `player`: string. Path of the AnimationPlayer whose animations the states play, relative to the scene root. Default: the one the tree already uses.
- `states` (required): list of at least 1 item. The states, each playing one animation of the AnimationPlayer or blending several, such as [{"name": "idle", "animation": "idle"}, {"name": "move", "blend": [{"animation": "walk", "at": 2}, {"animation": "run", "at": 6}]}]. Each item has:
  - `name` (required): string. Name of the state, such as "walk".
  - `animation`: string. The animation of the AnimationPlayer that the state plays, such as "walk". Give either animation or blend.
  - `blend`: list of at least 2 items. Blend animations by a parameter instead of playing one: [{"animation": "walk", "at": 2}, {"animation": "run", "at": 6}] blends walking and running by speed (BlendSpace1D); points at [x, y] blend in two dimensions (BlendSpace2D), which needs three points that are not on one line. Scripts set the position with parameters/<state>/blend_position. Each item has:
    - `animation` (required): string. An animation of the AnimationPlayer, such as "run".
    - `at` (required): number or list of 2 values. Where the animation plays fully: a number, such as the speed 6, or [x, y] in a two-dimensional blend, such as [1, 0] for strafing right.
  - `min`: number or list of 2 values. The lowest blend position, a number or [x, y] like the points. Default: the lowest point.
  - `max`: number or list of 2 values. The highest blend position, a number or [x, y] like the points. Default: the highest point.
- `transitions`: list of items. Transitions between the states. The machine begins at Start, so give one from Start to the first state. Default: none. Each item has:
  - `from` (required): string. The state the transition leaves; "Start" for the entry of the machine.
  - `to` (required): string. The state the transition enters; "End" for the exit of the machine.
  - `condition`: string. Take the transition when parameters/conditions/<condition> is true, such as "moving".
  - `expression`: string. Take the transition when this Godot expression is true, evaluated on the node in the tree's advance_expression_base_node, such as "velocity.length() > 0.1".
  - `advance`: "auto", "enabled" or "disabled". auto takes the transition by itself, enabled only when travel() asks for it, disabled never. Default: auto from Start and with a condition or expression, enabled otherwise.
  - `switch`: "immediate", "sync" or "at_end". When to switch: immediate (default), sync keeps the play position, at_end waits for the animation to end.
  - `xfade`: number, at least 0. Cross-fade time in seconds. Default: 0.
  - `priority`: integer from 0 to 32. Lower numbers win when several transitions could be taken. Default: 1.
- `scene`: string. The scene, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.

## Scripts, tests and exports

### `script_rename_symbol`

**Rename symbol.** Rename a function, signal, variable, constant, enum or class_name across the project with the editor's language server, which renames every use it can trace in the scripts; then also the method names of signal connections, the keys of method tracks, saved values and animated paths in scenes and resources that use the script, which a rename in code alone leaves broken. It lists the places that still name the old symbol, such as strings in call() or has_method(), to check by hand. Save open files first; needs the editor.

*Makes changes*

- `path` (required): string. The script that declares the symbol, as a res:// path, such as "res://enemy.gd".
- `symbol` (required): string. The function, signal, variable, constant, enum or class_name to rename, such as "take_damage".
- `new_name` (required): string. The new name, such as "apply_damage".

### `script_validate`

**Check scripts.** Check GDScript files for errors and warnings without running the game, as the Godot editor does: syntax, types, unknown identifiers, unused variables; and compile .gdshader files with Godot's shader compiler, which reports the first error of each shader with its line, also inside included files. Call it after writing or changing .gd or .gdshader files, before game_run. Scripts are checked with the editor's language server, or godot --check-only when the editor is not connected; shaders in the editor, or in Godot without a window.

*Read-only · loaded at the start*

- `paths` (required): list of strings, at least 1. Scripts, shaders or folders to check, as res:// paths or paths in the project, such as ["res://player/player.gd"], ["res://shaders/water.gdshader"] or ["res://player/"]. Folders are searched for .gd and .gdshader files; addons are skipped unless named.

### `test_install_framework`

**Install test framework.** Install a test framework into the project and enable its plugin, so that test_run can run the project's tests: GUT 9.7.1 (default) or gdUnit4 6.2.2, each pinned to the commit of its release and fetched from GitHub with git. It downloads code, so the user confirms every call.

*Makes changes · Claude Code asks before every call*

- `framework`: "gut" or "gdunit4", default `"gut"`. gut (default) installs GUT, gdunit4 installs gdUnit4.

### `test_run`

**Run tests.** Run the project's GUT or gdUnit4 tests in a separate Godot process and report the result: how many passed, failed and were skipped, each failure with its file, line and message, and test scripts that failed to load. Tests load scenes and resources from disk, so save changes first with scene_save. Works without the editor.

*Makes changes*

- `paths`: list of strings, default `[]`. Test folders or scripts to run, as res:// paths, such as ["res://test/"] or ["res://test/test_player.gd"]. Default: res://test and res://tests, or the folders that .gutconfig.json names.
- `name`: string. Run only the tests whose names contain this text, such as "dash". GUT only: gdUnit4 runs whole test suites.
- `framework`: "gut" or "gdunit4". The test framework, needed only when the project has both GUT and gdUnit4 in addons/.
- `headless`: boolean, default `true`. Run without a window. Set false for tests that need rendering or real input events; a window opens while they run.
- `timeout_ms`: integer from 1000 to 1800000, default `300000`. Stop the run after this many milliseconds.

### `export_preset_add`

**Add export preset.** Add an export preset for a platform to export_presets.cfg, with the default options of that platform, so that export_project can export the game; mode "pack" of export_project needs no export templates. The editor reads presets when it starts, so its Export dialog shows a preset added while it runs only after a restart.

*Makes changes*

- `platform` (required): "Windows Desktop", "Linux", "macOS", "Web", "Android" or "iOS". The platform to export to, as Project → Export names it.
- `name`: string. The name of the preset, which export_project takes. Default: the platform name.
- `export_path`: string. Where the export goes, inside the project folder, such as "build/linux/capsule-walk.x86_64". Default: build/<platform>/ with the game name and the extension of the platform.

### `export_project`

**Export the game.** Export the game with an export preset of the project, as Project → Export does, in a separate Godot process: a release or debug build, or only the game data as a .pck. The result lists the written files with their sizes and the warnings of the export. It writes only into a folder of its own inside the project, such as build/, which gets a .gdignore file so the editor does not import the exported files. Scenes and scripts are read from disk, so save changes first with scene_save. Release and debug builds need the export templates of the platform; when they are missing, the result says how to get them. Works without the editor.

*Makes changes*

- `preset`: string. The export preset, by its name in Project → Export, such as "macOS" or "Windows Desktop". Default: the only preset of the project.
- `mode`: "release", "debug" or "pack", default `"release"`. "release" or "debug" builds the game with the export templates of the platform; "pack" writes only the game data as a .pck or .zip file, which needs no export templates and runs with a Godot executable of the same version. Default: "release".
- `output`: string. Where to write the export, with the file name, inside the project folder, such as "build/macos/game.zip"; the extension picks the format. Default: the export path of the preset, ending in .pck in mode "pack".
- `timeout_ms`: integer from 10000 to 3600000, default `600000`. Stop the export after this many milliseconds.

## The running game

### `game_run`

**Run game.** Run the game and return its first output: the main scene by default, the scene open in the editor, or a scene by path. Waits until the game is ready, then watches it for a second, or for duration_ms and stops it. Runs from the editor, which saves the open scenes and scripts first; without the editor, starts Godot as a separate process. Script errors do not pause the game unless break_on_error is set; they come with file, line and stack.

*Makes changes · loaded at the start*

- `scene`: string, default `"main"`. What to run: "main" (the main scene of the project), "current" (the scene open in the editor), or a res://….tscn path. Default: "main".
- `duration_ms`: integer from 0 to 600000. Keep the game running this long after it is ready, then stop it. Without it, the game keeps running after the first second of output.
- `fixed_fps`: integer from 1 to 1000. Run with a fixed frame rate, such as 60: every frame advances the game by exactly 1/fps seconds, so runs repeat exactly. Game time then no longer follows the clock, and without a window the game runs as fast as it can, so count waits and holds in physics frames.
- `debug_draw`: list of "collisions", "navigation", "paths" or "avoidance". Draw debug shapes in the game, as the Debug menu of the editor does: "collisions" for collision shapes, "navigation" for navigation meshes, "paths" for Path3D curves, "avoidance" for avoidance radii. Screenshots then show why a body falls through a floor or a path takes a detour.
- `arguments`: list of strings. Arguments for the game, which its scripts read with OS.get_cmdline_user_args(), such as ["--level=3"].
- `window_size`: list of 2 values. Size of the game window [width, height] in pixels, such as [1280, 720], to check the layout at another size.
- `locale`: string. Run the game in this locale, such as "de" or "pt_BR", to check its translations.
- `break_on_error`: boolean. Stop the game in the debugger at its first script error, as at a breakpoint, so that debug_state shows the stack and the variables there. Default: false, the game runs on. Needs the editor.

### `game_stop`

**Stop game.** Stop the running game.

*Makes changes · loaded at the start*

No parameters.

### `game_get_output`

**Game output.** Read what the game printed since the last call: messages, warnings and errors with file, line and stack, plus errors the editor reported, such as script parse errors. Pass levels: ["error"] for errors only, or from_start to read the current run again from its start.

*Read-only · loaded at the start*

- `levels`: list of "error", "warning" or "info". Only these levels, such as ["error"]. Default: all.
- `from_start`: boolean, default `false`. Read the current run from its start instead of only what came after the last call.
- `max_entries`: integer from 1 to 500, default `100`. The most entries to return; call again for the rest.

### `game_get_tree`

**Running game tree.** Show the node tree of the running game, including nodes it created while running, such as spawned enemies or bullets: names, types, scripts, instanced scenes and groups. With controls: true, list the visible buttons, labels and other controls with their rectangles and states instead. Needs a game started with game_run, with or without the editor.

*Read-only*

- `path`: string. Show only this subtree: a path relative to the current scene, such as "Enemies", or "/root" for the whole tree with the autoloads. Default: the current scene.
- `max_depth`: integer from 0 to 64, default `8`. How many levels below the first node to show.
- `max_nodes`: integer from 1 to 2000, default `200`. The most nodes to list; hidden children are counted.
- `controls`: boolean. List the visible controls instead: buttons, labels, text fields, sliders and bars, with their rectangles in game-view pixels, their text and whether they are disabled, pressed or focused, so that a menu can be read and clicked without a screenshot.

### `game_get_properties`

**Running game properties.** Read properties of a node in the running game, like the remote inspector: positions, velocities, health, and getters such as is_on_floor(). Use it to check what the game is doing after game_run or game_wait. Needs a game started with game_run, with or without the editor.

*Read-only · loaded at the start*

- `path` (required): string. Path of the node in the running game: relative to the current scene, such as "Player"; "." for the scene root; or absolute, such as "/root/GameState" for an autoload.
- `names`: list of strings. Properties to read, such as ["position", "velocity"], or paths such as "position:y" or "mesh:size". Methods without arguments whose names start with is_, get_, has_ or can_ can be read too, such as "is_on_floor()". Default: every property whose value differs from its default.
- `include_defaults`: boolean, default `false`. Without names, also list properties at their default values. The list gets long.

### `game_set_properties`

**Set running game properties.** Change properties of a node in the running game to try something out, such as moving the player or raising its speed, including variables of its script without @export, such as a score; a setter of the variable runs. The change lasts until the game stops; scene files stay as they are. Every value is read back. Needs a game started with game_run, with or without the editor.

*Makes changes*

- `path` (required): string. Path of the node in the running game: relative to the current scene, such as "Player"; "." for the scene root; or absolute, such as "/root/GameState" for an autoload.
- `properties` (required): object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. A path changes one part only: "mesh:size" a property of the node's own mesh, "position:y" one coordinate. Every value is read back after it is set.

### `game_wait`

**Wait in the game.** Wait in the running game until a condition holds on a node, such as "is_on_floor()" on Player, until a node emits a signal, such as "died", or for a number of physics frames, frames or milliseconds. Pass exactly one of condition, signal, physics_frames, frames or ms. While game_pause holds the game, game_wait plays it until then and pauses it again on that frame, such as at the top of a jump with "velocity.y <= 0". Needs a game started with game_run, with or without the editor.

*Read-only · loaded at the start*

- `condition`: string. Wait until this Godot expression is true on the node, such as "is_on_floor()" or "position.y < 0.1". It is checked after every physics frame.
- `signal`: string. Instead of a condition, wait until the node emits this signal, such as "died" or "landed", and return its arguments.
- `node`: string. The node the condition is evaluated on, or that emits the signal, such as "Player". Default: the current scene root.
- `timeout_ms`: integer from 1 to 60000, default `10000`. How long to wait for the condition or the signal before giving up. Default: 10 seconds.
- `physics_frames`: integer from 1 to 36000. Instead of a condition, wait this many physics frames (60 per second by default).
- `frames`: integer from 1 to 36000. Instead of a condition, wait this many rendered frames.
- `ms`: integer from 1 to 60000. Instead of a condition, wait this many milliseconds.

### `game_input`

**Play input into the game.** Play input into the running game step by step: hold input actions, keys, gamepad buttons and sticks, move, click, drag and scroll the mouse, click a Control by its path, touch and drag fingers, type text, wait, and read nodes or take screenshots at exact moments, such as the height of a jump 10 physics frames after the press, which a later call would miss. A hold of N physics frames lasts exactly N frames of the game. While game_pause holds the game, the input plays it only for its holds and waits, then pauses it again. Also check the result with game_get_properties or a screenshot right after the last step (screenshot: true). Actions must exist in the project when the game starts. Needs a game started with game_run, with or without the editor.

*Makes changes · loaded at the start*

- `steps` (required): list of 1 to 200 items. Input to play in order, such as [{"action": "move_forward", "ms": 1000}, {"action": "jump"}, {"wait_physics_frames": 10}, {"read": "Player", "names": ["position"]}, {"mouse_motion": [120, 0]}, {"click": [640, 360]}, {"wait_ms": 300}]. Each item is one of:
  - an object with:
    - `action` (required): string. An input action of the project, such as "jump".
    - `strength`: number from 0 to 1. How strongly the action is pressed, from 0 to 1. Default: 1.
    - `state`: "tap", "down" or "up". "tap" (default) presses, holds and releases; "down" only presses; "up" only releases.
    - `physics_frames`: integer from 1 to 3600. How long to hold, in physics frames (60 per second by default). Default: 2.
    - `ms`: integer from 1 to 60000. How long to hold, in milliseconds.
  - an object with:
    - `key` (required): string. A key name, such as "W", "Space", "Escape" or "Ctrl+S".
    - `shift`: boolean. Hold Shift with the key.
    - `ctrl`: boolean. Hold Ctrl with the key.
    - `alt`: boolean. Hold Alt with the key.
    - `meta`: boolean. Hold Meta (Cmd on macOS) with the key.
    - `state`: "tap", "down" or "up". "tap" (default) presses, holds and releases; "down" only presses; "up" only releases.
    - `physics_frames`: integer from 1 to 3600. How long to hold, in physics frames (60 per second by default). Default: 2.
    - `ms`: integer from 1 to 60000. How long to hold, in milliseconds.
  - an object with:
    - `joypad_button` (required): string. A gamepad button: a, b, x, y, back, guide, start, left_stick, right_stick, left_shoulder, right_shoulder, dpad_up, dpad_down, dpad_left or dpad_right.
    - `state`: "tap", "down" or "up". "tap" (default) presses, holds and releases; "down" only presses; "up" only releases.
    - `physics_frames`: integer from 1 to 3600. How long to hold, in physics frames (60 per second by default). Default: 2.
    - `ms`: integer from 1 to 60000. How long to hold, in milliseconds.
  - an object with:
    - `joypad_motion` (required): string. A gamepad axis: left_x, left_y, right_x, right_y, trigger_left or trigger_right.
    - `value`: number from -1 to 1. Where to hold the axis, from -1 to 1: left and up are negative, and a trigger goes from 0 to 1. Needed unless state is "up", which centers it again.
    - `state`: "tap", "down" or "up". "tap" (default) presses, holds and releases; "down" only presses; "up" only releases.
    - `physics_frames`: integer from 1 to 3600. How long to hold, in physics frames (60 per second by default). Default: 2.
    - `ms`: integer from 1 to 60000. How long to hold, in milliseconds.
  - an object with:
    - `mouse_motion` (required): list of 2 numbers. Move the mouse by [dx, dy] pixels of the game view, such as for mouse look.
  - an object with:
    - `click` (required): list of 2 numbers or string. Click at [x, y] in pixels of the game view, as in game screenshots, or on the middle of a visible Control by its path, such as "Menu/Resume".
    - `button`: "left", "right" or "middle". The mouse button. Default: left.
    - `double`: boolean. Double-click.
    - `state`: "tap", "down" or "up". "tap" (default) clicks; "down" presses the button and keeps it held, so that mouse_motion steps drag; "up" releases it.
  - an object with:
    - `wheel` (required): "up", "down", "left" or "right". Turn the mouse wheel, such as to zoom a camera or scroll a list.
    - `at`: list of 2 numbers. Where the mouse is, [x, y] in pixels of the game view. Default: where it already is.
    - `clicks`: integer from 1 to 20. How many notches to turn. Default: 1.
  - an object with:
    - `touch` (required): list of 2 numbers. Touch the screen at [x, y] in pixels of the game view.
    - `finger`: integer from 0 to 9. Which finger, from 0 to 9, for gestures with several fingers. Default: 0.
    - `state`: "tap", "down" or "up". "tap" (default) presses, holds and releases; "down" only presses; "up" only releases.
    - `physics_frames`: integer from 1 to 3600. How long to hold, in physics frames (60 per second by default). Default: 2.
    - `ms`: integer from 1 to 60000. How long to hold, in milliseconds.
  - an object with:
    - `touch_drag` (required): list of 2 numbers. Drag a finger that is down by [dx, dy] pixels of the game view.
    - `finger`: integer from 0 to 9. Which finger, from 0 to 9, for gestures with several fingers. Default: 0.
  - an object with:
    - `text` (required): string. Type this text, as into a focused LineEdit.
  - an object with:
    - `wait_ms` (required): integer from 1 to 60000. Wait this many milliseconds.
  - an object with:
    - `wait_physics_frames` (required): integer from 1 to 3600. Wait this many physics frames.
  - an object with:
    - `read` (required): string. A node of the running game to read at this moment of the input, such as "Player", as in game_get_properties.
    - `names` (required): list of strings, at least 1. Properties and getters to read, such as ["position", "velocity", "is_on_floor()"]. The result lists them with the physics frames played since the input began.
  - an object with:
    - `screenshot` (required): true. Take a screenshot at this moment; up to 6 screenshots of one input, the final one included, come back as one labelled image.
- `release_at_end`: boolean, default `true`. Release every action and key that is still held after the last step. Default: true.
- `screenshot`: boolean, default `false`. Take a screenshot of the game window right after the last step, as game_screenshot does, so that it shows the moment the input ends.
- `watch_signals`: list of at most 10 items. Signals to watch while the input plays; the result lists every emission with its step, physics frame and arguments, such as to check that "landed" is emitted exactly once. Each item has:
  - `node`: string. The node that emits the signal, such as "Player". Default: the current scene root.
  - `signal` (required): string. The signal, such as "landed".

### `game_screenshot`

**Game screenshot.** See the running game: a screenshot of its window with the UI, a strip of frames a given number of physics frames apart, or renders of its 3D world from other angles that leave the game camera alone. Returns the image and the path of its file. Pixel positions in a screenshot of the window are the positions that game_input clicks use. Needs a game started with game_run that has a window, with or without the editor.

*Read-only*

- `views`: list of 1 to 6 items. Render the 3D scene from these angles instead of the game window, up to 6 in one labelled image: a preset "front" (from +Z), "back", "left" (from -X), "right", "top" or "iso", framed on the whole scene; {"preset": "front", "target": "Player"} to frame one node; or {"position": [0, 8, 12], "look_at": [0, 0, 0]} for a camera at a point. Each view also takes "fov" and "label". Each item is one of:
  - "front", "back", "left", "right", "top" or "iso".
  - an object with:
    - `preset` (required): "front", "back", "left", "right", "top" or "iso".
    - `target`: string. A node to frame instead of the whole scene, such as "Player".
    - `fov`: number from 1 to 179. Vertical field of view in degrees. Default: 50.
    - `label`: string. Caption of the view in the image.
  - an object with:
    - `position` (required): list of 3 numbers. Camera position [x, y, z] in world coordinates.
    - `look_at`: list of 3 numbers. The point the camera looks at. Default: the center of target, or of the whole scene.
    - `target`: string. A node to frame instead of the whole scene, such as "Player".
    - `fov`: number from 1 to 179. Vertical field of view in degrees. Default: 50.
    - `label`: string. Caption of the view in the image.
- `frames`: integer from 2 to 6. Instead of one moment, take this many screenshots of the game window, every_physics_frames apart, as one labelled image, to see motion such as a jump, an animation or a camera move. While game_pause holds the game, it plays exactly those frames and pauses again.
- `every_physics_frames`: integer from 1 to 600. Physics frames between the screenshots of frames. Default: 5.
- `max_size`: integer from 256 to 2560, default `1280`. The longest side of the image in pixels. Default: 1280.
- `format`: "png" or "jpeg", default `"png"`. png (default), or jpeg for a smaller file.

### `game_pause`

**Pause or resume the game.** Pause the running game so that nothing moves, or resume it with paused: false. While it is paused, game_get_properties, game_screenshot and node_get_bounds read a frozen moment; game_step advances it by exact physics frames, and game_input and game_wait play it only for their holds and waits, then pause it again. Input sent while it is paused reaches the game in the next frame it plays. Nodes that the game sets to always process keep running. Needs a game started with game_run, with or without the editor.

*Makes changes*

- `paused`: boolean, default `true`. false resumes a paused game.

### `game_step`

**Step the game.** Advance the paused game by exactly the given number of physics frames and keep it paused, to check what happens frame by frame, such as the height of a jump after 10 frames. Input sent while the game is paused reaches it in the first of these frames. A running game is paused after the frames. Needs a game started with game_run, with or without the editor.

*Makes changes*

- `physics_frames`: integer from 1 to 3600, default `1`. How many physics frames to advance the game by (60 per second by default).

### `game_performance`

**Game performance.** Measure how the running game performs over a number of frames: frame time and FPS, time spent in process and physics code, draw calls and primitives, memory, counts of objects and nodes with orphan nodes (a sign of leaks), the load of 3D physics, the custom monitors the game adds with Performance.add_custom_monitor(), and in a game started from the editor the script functions that took the most time, with their files and lines. Needs a game started with game_run, with or without the editor.

*Read-only*

- `frames`: integer from 1 to 600, default `60`. How many frames to measure.

### `game_eval`

**Evaluate in the game.** Evaluate a Godot expression on a node of the running game and return its value, for questions that properties and getters do not answer, such as the distance between two nodes or the number of nodes in a group. It can call any method, so it can change the game. The user confirms every call, and the project must allow unsafe tools in the editor. Needs a game started with game_run, with or without the editor.

*Makes changes · off by default; Claude Code asks before every call*

- `expression` (required): string. A Godot expression evaluated on the node, such as "position.y", "velocity.length()" or "get_tree().get_nodes_in_group(\"enemies\").size()". It can call methods, so it can change the game.
- `node`: string. The node to evaluate it on: a path relative to the current scene, such as "Player", or absolute, such as "/root/GameState". Default: the scene root.

## Debugging

### `debug_breakpoints`

**Set breakpoints.** Add or remove breakpoints in GDScript files, or list them. The game stops at a breakpoint when its code reaches that line while it runs from the editor (game_run), and debug_state then shows the stack and the variables there. They are the editor's own breakpoints, so the user sees them in the script editor; clear removes all of them, also those the user set. A breakpoint on an empty line or a comment never stops the game.

*Makes changes*

- `add`: list of strings, default `[]`. Breakpoints to add, each "res://path.gd:line" with the line counted from 1, such as ["res://player/player.gd:42"].
- `remove`: list of strings, default `[]`. Breakpoints to remove, written the same way.
- `clear`: boolean, default `false`. Remove every breakpoint of the project first, also those the user set in the script editor.

### `debug_state`

**Debugger state.** Show where the game stopped in the debugger and why — a breakpoint, a step or an error — with the stack of function calls, the code around the line, and the local variables and members of a stack frame; with expression, also the value of a GDScript expression in that frame. With wait_ms it first waits for the game to stop, such as after game_input made the player do what reaches the breakpoint. While the game is stopped, game_get_properties still reads nodes, but game_wait, game_input and screenshots need debug_continue first.

*Read-only*

- `wait_ms`: integer from 0 to 300000, default `0`. When the game is not stopped, wait this long for it to stop at a breakpoint, such as after game_input made the player jump. Default: 0, answer at once.
- `frame`: integer, at least 0, default `0`. The stack frame whose code and variables to show: 0 is the line where the game stopped, 1 the function that called it, and so on.
- `expression`: string. A GDScript expression to evaluate in that frame, with its locals and members, such as "health - amount" or "get_node('Camera').position".

### `debug_continue`

**Continue or step.** Resume the game stopped in the debugger, until the next breakpoint, or by one line of code at a time. After a step the result shows the new line and its variables.

*Makes changes*

- `action`: "continue", "step_over", "step_into" or "step_out", default `"continue"`. "continue" runs the game until the next breakpoint; "step_over" runs the current line and stops at the next one; "step_into" also stops inside the functions that the line calls; "step_out" runs to the end of the current function and stops in the one that called it. Default: "continue".

## Engine reference

### `docs_class`

**Class reference.** Read the reference of the installed Godot version for a class: what it inherits, its properties, methods with their signatures, signals, enums and constants, each with a short summary; with member, the full description of one of them. Covers engine classes, built-in types such as Vector3, @GlobalScope functions such as lerp, and the class_name classes of the project. Use it before writing code with an API you are unsure of.

*Read-only*

- `name` (required): string. A class such as "CharacterBody3D", a built-in type such as "Vector3", a class_name of the project, or "@GlobalScope"; "Class.member" works too.
- `member`: string. One property, method, signal, constant or enum of the class to show in full, such as "move_and_slide". Inherited members are found too.

### `docs_search`

**Search the reference.** Search the reference of the installed Godot version and the project's own classes by words in class and member names and their summaries, such as "raycast", "tween" or "look at". Returns classes and members to read with docs_class.

*Read-only*

- `query` (required): string. Words to look for in class and member names and their summaries, such as "raycast", "tween" or "look at".
- `max_results`: integer from 1 to 50, default `15`. The most results to list.

## Prompts

In Claude Code the prompts are slash commands; the [usage guide](usage.md#slash-commands) shows how to run them.

### `fix_last_run`

**Fix the last run.** Fix the errors of the last game run: hands over the errors with file, line and stack, and the steps to find each cause, fix it, check the scripts and run the game again.

No arguments.

### `playtest`

**Playtest.** Playtest the game, or one scene of it, through the game tools and report what works, what does not, the errors and the performance, without changing the project.

- `scene`: The scene to playtest, as a res:// path. Default: the main scene.

## Resources

- `godot://project`: **Project overview.** The Godot project: main scene, renderer, window, autoloads, plugins, global classes and the indentation of .gd files, as project_info shows it.
- `godot://logs/last-run`: **Output of the last game run.** What the last game run printed from its start: messages, warnings and errors with file, line and stack, as game_get_output shows it.
- `godot://scene/{+path}`: **Scene tree.** The node tree of a scene of the project, such as godot://scene/levels/arena.tscn, as scene_get_tree shows it.
- `godot://docs/{class}`: **Class reference.** The reference of an engine class or a class_name of the project in the installed Godot, such as godot://docs/CharacterBody3D, as docs_class shows it.
