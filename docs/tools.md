# Tool reference

Every tool, prompt and resource of the Godot MCP Tool server, as Claude sees them. This page is generated from the
code: after changing a tool, run `npm run docs:tools` in `server/`; a unit test fails while the page is out of date.

The line under each tool says what kind of tool it is:

- *Read-only*: it reads the project, the editor or the running game and changes nothing. Read-only mode
  (`GODOT_MCP_READ_ONLY=1`) keeps only these tools.
- *Makes changes*: it changes the project, the editor or the running game.
- *Loaded at the start*: Claude has it from the first message; Claude Code loads the other tools when a task needs
  them.
- *Off by default*: one of the unsafe tools. They need `GODOT_MCP_UNSAFE=1` and Project → Tools → Godot MCP Tool →
  Allow Unsafe Tools in the editor, and Claude Code asks before every call.

## Contents

- [Connection and editor](#connection-and-editor): `godot_status`, `editor_launch`, `editor_rescan`, `editor_screenshot`, `editor_select`, `editor_run_script`
- [Project](#project): `project_info`, `project_settings_get`, `project_settings_set`, `input_map_get`, `input_map_set`, `autoload_add`, `autoload_remove`
- [Scenes and nodes](#scenes-and-nodes): `scene_create`, `scene_open`, `scene_save`, `scene_get_tree`, `scene_batch_edit`, `node_add`, `node_delete`, `node_duplicate`, `node_reparent`, `node_find`, `node_get_properties`, `node_get_bounds`, `node_set_properties`, `signal_list`, `signal_connect`, `signal_disconnect`, `node_set_groups`, `scene_close`, `node_call_method`
- [Resources and files](#resources-and-files): `resource_create`, `resource_get`, `resource_set_properties`, `resource_find_usages`, `filesystem_move`, `asset_import_settings_get`, `asset_import_settings_set`, `filesystem_delete`
- [Animation and navigation](#animation-and-navigation): `navigation_bake`, `animation_get`, `animation_set`, `animation_delete`, `animation_tree_get`, `animation_tree_set`
- [Scripts, tests and exports](#scripts-tests-and-exports): `script_validate`, `test_run`, `export_project`
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

**Rescan project files.** Make the editor pick up files changed outside it, such as scripts, scenes or assets written to disk: rescan the project, import new assets and reload changed scripts. Call it after writing files and before using them in scenes.

*Makes changes · loaded at the start*

No parameters.

### `editor_screenshot`

**Editor screenshot.** Render the 3D scene open in the editor from the editor camera or from given views, without the grid and gizmos; the editor camera stays where it is. Check placement and scale from more than one side, such as ["front", "top", "iso"]. The lighting is the editor preview, so check the final look with game_screenshot. Needs the editor with a window.

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
- `max_size`: integer from 256 to 2560, default `1280`. The longest side of the image in pixels. Default: 1280.
- `format`: "png" or "jpeg", default `"png"`. png (default), or jpeg for a smaller file.

### `editor_select`

**Select in the editor.** Select nodes in the scene tree of the editor, or a file in its FileSystem dock, to show the user what you are talking about; the inspector shows what is selected. Changes nothing in the project.

*Makes changes*

- `nodes`: list of strings. Paths of the nodes to select in the scene tree, such as ["Player", "Player/Camera"].
- `scene`: string. The scene of the nodes, as a res:// path; the editor switches to it. Default: the scene open in the editor.
- `file`: string. A file or folder to select in the FileSystem dock instead, such as "res://materials/ice.tres".

### `editor_run_script`

**Run code in the editor.** Run GDScript code inside the editor for what no other tool covers, such as one change across many nodes or a question about the editor itself. The code can do anything the editor can, files included; its changes are not recorded for Undo, and scenes stay unsaved until scene_save. Errors come back with the lines of the code. The user confirms every call, and the editor must allow unsafe tools.

*Makes changes · off by default; Claude Code asks before every call*

- `code` (required): string. GDScript statements: the body of func run(scene: Node) -> Variant, where scene is the scene open in the editor. EditorInterface and every engine class are available. Return a value to see it, such as return scene.get_child_count().

## Project

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

### `autoload_add`

**Add autoload.** Register a script or scene as an autoload: Godot creates it when the game starts and keeps it as a global node that every script reaches by its name, such as GameState.score. Use it for game-wide state, settings and managers. Saves project.godot at once.

*Makes changes*

- `name` (required): string. The global name of the autoload that scripts use, such as "GameState".
- `path` (required): string. The script or scene to create when the game starts, as a res:// path, such as "res://autoload/game_state.gd". A script must extend Node.

### `autoload_remove`

**Remove autoload.** Remove an autoload from the project and save project.godot. Its script or scene file stays; scripts that use the autoload name fail until they are changed.

*Makes changes*

- `name` (required): string. The global name of the autoload that scripts use, such as "GameState".

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

**Scene tree.** Show the node tree of a scene as compact text: node names and types, attached scripts, instanced scenes and groups. Use it before changing a scene to learn the node paths that the node tools take. Reads the scene open in the editor by default, or any scene by its res:// path.

*Read-only · loaded at the start*

- `scene`: string. The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.
- `max_depth`: integer from 0 to 64, default `8`. How many levels below the root to show.
- `max_nodes`: integer from 1 to 2000, default `200`. The most nodes to list; hidden children are counted.

### `scene_batch_edit`

**Edit scene in one step.** Apply many scene changes in one call and as one Undo step: add, delete, change, move and duplicate nodes, set their groups, connect and disconnect signals. Later operations can use the nodes that earlier ones added or renamed. If any operation fails or any property is rejected, nothing is changed and the error names the operation; a value that the engine adjusts, such as a size raised to the minimum of a control, is kept and reported. Use it to build or rework a scene.

*Makes changes · loaded at the start*

- `operations` (required): list of 1 to 100 items. The changes in order. Each is {"op": a tool name, ...the parameters of that tool except scene}, such as {"op": "node_add", "type": "CharacterBody3D", "name": "Player"}, {"op": "node_set_properties", "path": "Player", "properties": {"position": [0, 1, 0]}} or {"op": "signal_connect", "from": "Start", "signal": "pressed", "method": "_on_start_pressed"}. op is node_add, node_delete, node_set_properties, node_set_groups, node_reparent, node_duplicate, signal_connect or signal_disconnect. Each item is one of:
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
- `properties`: object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. Every value is read back after it is set.
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
- `properties`: object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. Every value is read back after it is set.
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

### `node_find`

**Find nodes.** Find nodes in a scene by name, type, group or attached script; every given criterion must match. Returns their paths for the other node tools. Nodes inside instanced scenes are not searched, only the instances themselves.

*Read-only*

- `name`: string. Part of the node name, or a pattern with * and ?, such as "Enemy*". Case does not matter.
- `type`: string. A node class or class_name. Subclasses match too, so "Light3D" finds every light.
- `group`: string. A group the node belongs to, such as "enemies".
- `script`: string. The attached script, as a res:// path or a file name such as "player.gd".
- `scene`: string. The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.
- `max_results`: integer from 1 to 500, default `50`. The most nodes to list.

### `node_get_properties`

**Node properties.** Read the properties of a node: those that differ from their defaults, or the ones named. Each value comes with its type, in Godot syntax; enums list their options. Use it to check a node before or after changing it.

*Read-only · loaded at the start*

- `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
- `names`: list of strings. Properties to read, such as ["position", "mesh"]. Default: every property whose value differs from its default.
- `include_defaults`: boolean, default `false`. Without names, also list properties at their default values. The list gets long.
- `scene`: string. The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.

### `node_get_bounds`

**Node bounds.** Measure the box that a 3D node and its children take up in world coordinates: center, size and corners, from its meshes and CSG shapes, or from its collision shapes when it has none. Use it to check placement and scale, such as whether a crate rests on the floor or a door is wide enough for the player.

*Read-only*

- `path` (required): string. Path of the node relative to the scene root, such as "Level/Crate"; "." measures the whole scene. With in_game, a path in the running game, such as "Player".
- `scene`: string. The scene to read, as a res:// path or "main" for the main scene of the project; a scene that is not open is read from disk. Default: the scene currently open in the editor.
- `in_game`: boolean, default `false`. Measure the node in the running game instead, where it may have moved. Needs a game started from the editor.

### `node_set_properties`

**Set node properties.** Set several properties of a node as one Undo step, including script (a res://….gd path) and resources (a res:// path, or {"new": "Class", …} to create one). Every value is read back: the result lists what applied, what was rejected and why, and what the engine changed, for example by clamping.

*Makes changes*

- `path` (required): string. Path of the node relative to the scene root, such as "Player/Camera"; "." is the root itself.
- `properties` (required): object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. Every value is read back after it is set.
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

### `resource_create`

**Create resource.** Create a resource file (.tres) with its properties set at once and save it: a material, physics material, environment, curve, or a resource of a class of the project. Use it for resources that several nodes or scenes share and assign it to them by its res:// path; a resource that only one node uses can be created right in the node property with {"new": "Class", …} instead. The result reports which properties applied.

*Makes changes*

- `path` (required): string. Where to save the new resource, as a res:// path ending in .tres, such as "res://materials/ice.tres". Missing folders are created; an existing file is never replaced.
- `type` (required): string. The resource class: an engine class such as "StandardMaterial3D", "PhysicsMaterial", "Environment" or "Curve", or a class_name of the project that extends Resource.
- `properties`: object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. Every value is read back after it is set.

### `resource_get`

**Read resource.** Read a resource file such as a material, physics material or environment: its type, the properties that differ from their defaults or the ones named, each with its type in Godot syntax, and the files it depends on. Scenes are read with scene_get_tree instead.

*Read-only*

- `path` (required): string. The resource file, as a res:// path such as "res://materials/ice.tres".
- `names`: list of strings. Properties to read, such as ["albedo_color", "roughness"]. Default: every property whose value differs from its default.
- `include_defaults`: boolean, default `false`. Without names, also list properties at their default values. The list gets long.

### `resource_set_properties`

**Set resource properties.** Set several properties of a resource file such as a material or physics material as one Undo step and save the file, so the scenes that use it, the game and the tests see the change at once. Every value is read back: the result lists what applied, what was rejected and why, and what the engine changed. Imported files such as textures and models are changed through their import settings instead, with asset_import_settings_set.

*Makes changes*

- `path` (required): string. The resource file, as a res:// path such as "res://materials/ice.tres".
- `properties` (required): object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. Every value is read back after it is set.

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

**Create or replace animation.** Create or replace an animation of an AnimationPlayer from property tracks, as one Undo step: each track animates one property, such as {"path": "Door:position", "keys": [{"time": 0, "value": [0, 0, 0]}, {"time": 1, "value": [0, 3, 0]}]}, with a node path relative to the parent of the player and values in the formats of node_set_properties. A track the editor cannot use is rejected with the reason and the others are kept. Like the editor, it keys the current value of each newly animated property in the RESET animation, the pose that the other animations and AnimationTree blends start from; without it, a property that only some animations of a state machine animate would blend from zero. An animation plays when a script calls play("name") on the player or when the player's autoplay names it; check it in the running game with game_wait and game_get_properties.

*Makes changes*

- `player` (required): string. Path of the AnimationPlayer relative to the scene root, such as "AnimationPlayer" or "Door/AnimationPlayer".
- `name` (required): string. Name of the animation, such as "open"; "library/name" for an animation of another library than the default one.
- `length`: number, above 0. Length in seconds. Default: the time of the last key.
- `loop`: "none", "linear" or "pingpong". none (default) plays once, linear repeats, pingpong goes back and forth.
- `tracks` (required): list of at least 1 item. One track per animated property, with all its keys. Each item has:
  - `path` (required): string. Node and property, relative to the parent of the player: "Door:position", "Door:position:y", ".:visible" for the parent itself.
  - `keys` (required): list of at least 1 item. Each item has:
    - `time` (required): number, at least 0. Seconds from the start of the animation.
    - `value` (required): value. The value, in the formats of node_set_properties, such as [0, 3, 0] for a Vector3 or true for visible.
  - `interpolation`: "nearest", "linear", "cubic", "linear_angle" or "cubic_angle". How values blend between keys. Default: linear; linear_angle turns rotations the short way.
  - `update`: "continuous", "discrete" or "capture". continuous blends every frame, discrete changes at each key. Default: discrete for values that cannot blend, such as bool and text, continuous otherwise.
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

**Set up animation state machine.** Set up an AnimationTree as a state machine, as one Undo step: states that each play an animation of the AnimationPlayer, and transitions between them, such as {"from": "Start", "to": "idle"} and {"from": "idle", "to": "walk", "condition": "moving", "xfade": 0.2}. It replaces the tree root; states or transitions the editor cannot use are rejected with the reason and the rest are kept. Scripts switch states by setting conditions, such as $AnimationTree.set("parameters/conditions/moving", true), or with travel("walk") on parameters/playback. In the running game, set a condition with game_set_properties on the AnimationTree and wait for a state with game_wait and the condition get("parameters/playback").get_current_node() == "walk".

*Makes changes*

- `tree` (required): string. Path of the AnimationTree relative to the scene root, such as "AnimationTree" or "Player/AnimationTree".
- `player`: string. Path of the AnimationPlayer whose animations the states play, relative to the scene root. Default: the one the tree already uses.
- `states` (required): list of at least 1 item. The states, each playing one animation of the AnimationPlayer, such as [{"name": "idle", "animation": "idle"}, {"name": "walk", "animation": "walk"}]. Each item has:
  - `name` (required): string. Name of the state, such as "walk".
  - `animation` (required): string. The animation of the AnimationPlayer that the state plays, such as "walk".
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

### `script_validate`

**Check scripts.** Check GDScript files for errors and warnings without running the game, as the Godot editor does: syntax, types, unknown identifiers, unused variables. Call it after writing or changing .gd files, before game_run. Uses the editor's language server, or godot --check-only when the editor is not connected.

*Read-only · loaded at the start*

- `paths` (required): list of strings, at least 1. Scripts or folders to check, as res:// paths or paths in the project, such as ["res://player/player.gd"] or ["res://player/"]. Folders are searched for .gd files; addons are skipped unless named.

### `test_run`

**Run tests.** Run the project's GUT or gdUnit4 tests in a separate Godot process and report the result: how many passed, failed and were skipped, each failure with its file, line and message, and test scripts that failed to load. Tests load scenes and resources from disk, so save changes first with scene_save. Works without the editor.

*Makes changes*

- `paths`: list of strings, default `[]`. Test folders or scripts to run, as res:// paths, such as ["res://test/"] or ["res://test/test_player.gd"]. Default: res://test and res://tests, or the folders that .gutconfig.json names.
- `name`: string. Run only the tests whose names contain this text, such as "dash". GUT only: gdUnit4 runs whole test suites.
- `framework`: "gut" or "gdunit4". The test framework, needed only when the project has both GUT and gdUnit4 in addons/.
- `headless`: boolean, default `true`. Run without a window. Set false for tests that need rendering or real input events; a window opens while they run.
- `timeout_ms`: integer from 1000 to 1800000, default `300000`. Stop the run after this many milliseconds.

### `export_project`

**Export the game.** Export the game with an export preset of the project, as Project → Export does, in a separate Godot process: a release or debug build, or only the game data as a .pck. The result lists the written files with their sizes and the warnings of the export. It writes only into a folder of its own inside the project, such as build/, which gets a .gdignore file so the editor does not import the exported files. Scenes and scripts are read from disk, so save changes first with scene_save. Release and debug builds need the export templates of the platform; when they are missing, the result says how to get them. Works without the editor.

*Makes changes*

- `preset`: string. The export preset, by its name in Project → Export, such as "macOS" or "Windows Desktop". Default: the only preset of the project.
- `mode`: "release", "debug" or "pack", default `"release"`. "release" or "debug" builds the game with the export templates of the platform; "pack" writes only the game data as a .pck or .zip file, which needs no export templates and runs with a Godot executable of the same version. Default: "release".
- `output`: string. Where to write the export, with the file name, inside the project folder, such as "build/macos/game.zip"; the extension picks the format. Default: the export path of the preset, ending in .pck in mode "pack".
- `timeout_ms`: integer from 10000 to 3600000, default `600000`. Stop the export after this many milliseconds.

## The running game

### `game_run`

**Run game.** Run the game and return its first output: the main scene by default, the scene open in the editor, or a scene by path. Waits until the game is ready, then watches it for a second, or for duration_ms and stops it. Runs from the editor, which saves the open scenes and scripts first; without the editor, starts Godot as a separate process. Script errors do not pause the game; they come with file, line and stack.

*Makes changes · loaded at the start*

- `scene`: string, default `"main"`. What to run: "main" (the main scene of the project), "current" (the scene open in the editor), or a res://….tscn path. Default: "main".
- `duration_ms`: integer from 0 to 600000. Keep the game running this long after it is ready, then stop it. Without it, the game keeps running after the first second of output.
- `fixed_fps`: integer from 1 to 1000. Run with a fixed frame rate, such as 60: every frame advances the game by exactly 1/fps seconds, so runs repeat exactly. Game time then no longer follows the clock, and without a window the game runs as fast as it can, so count waits and holds in physics frames.

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

**Running game tree.** Show the node tree of the running game, including nodes it created while running, such as spawned enemies or bullets: names, types, scripts, instanced scenes and groups. Needs a game started with game_run, with or without the editor.

*Read-only*

- `path`: string. Show only this subtree: a path relative to the current scene, such as "Enemies", or "/root" for the whole tree with the autoloads. Default: the current scene.
- `max_depth`: integer from 0 to 64, default `8`. How many levels below the first node to show.
- `max_nodes`: integer from 1 to 2000, default `200`. The most nodes to list; hidden children are counted.

### `game_get_properties`

**Running game properties.** Read properties of a node in the running game, like the remote inspector: positions, velocities, health, and getters such as is_on_floor(). Use it to check what the game is doing after game_run or game_wait. Needs a game started with game_run, with or without the editor.

*Read-only · loaded at the start*

- `path` (required): string. Path of the node in the running game: relative to the current scene, such as "Player"; "." for the scene root; or absolute, such as "/root/GameState" for an autoload.
- `names`: list of strings. Properties to read, such as ["position", "velocity"]. Methods without arguments whose names start with is_, get_, has_ or can_ can be read too, such as "is_on_floor()". Default: every property whose value differs from its default.
- `include_defaults`: boolean, default `false`. Without names, also list properties at their default values. The list gets long.

### `game_set_properties`

**Set running game properties.** Change properties of a node in the running game to try something out, such as moving the player or raising its speed. The change lasts until the game stops; scene files stay as they are. Every value is read back. Needs a game started with game_run, with or without the editor.

*Makes changes*

- `path` (required): string. Path of the node in the running game: relative to the current scene, such as "Player"; "." for the scene root; or absolute, such as "/root/GameState" for an autoload.
- `properties` (required): object that maps names to values. Property names mapped to values, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh", "size": [2, 1, 2]}}. Formats: numbers, booleans and text as JSON; vectors as [x, y, z] or "Vector3(0, 1, 0)"; rotation is in radians, rotation_degrees takes degrees; colors as "#ff8800", "orange" or [r, g, b, a] with channels from 0 to 1; enums by option name ("Double-Sided") or number; flags as a list of names; physics and render layers as layer numbers ([1, 3]); resources as a "res://…" path, or {"new": "Class", …properties} to create one; a script as "res://….gd"; node references as paths relative to the node ("../Player") or to the scene root ("Player"); Transform3D, Basis, AABB and Rect2 in Godot syntax ("Transform3D(…)"). Scripting properties such as global_position work too. Every value is read back after it is set.

### `game_wait`

**Wait in the game.** Wait in the running game until a condition holds on a node, such as "is_on_floor()" on Player, or for a number of physics frames, frames or milliseconds. Pass exactly one of condition, physics_frames, frames or ms. While game_pause holds the game, game_wait plays it until then and pauses it again on that frame, such as at the top of a jump with "velocity.y <= 0". Needs a game started with game_run, with or without the editor.

*Read-only · loaded at the start*

- `condition`: string. Wait until this Godot expression is true on the node, such as "is_on_floor()" or "position.y < 0.1". It is checked after every physics frame.
- `node`: string. The node the condition is evaluated on, such as "Player". Default: the current scene root.
- `timeout_ms`: integer from 1 to 60000, default `10000`. How long to wait for the condition before giving up. Default: 10 seconds.
- `physics_frames`: integer from 1 to 36000. Instead of a condition, wait this many physics frames (60 per second by default).
- `frames`: integer from 1 to 36000. Instead of a condition, wait this many rendered frames.
- `ms`: integer from 1 to 60000. Instead of a condition, wait this many milliseconds.

### `game_input`

**Play input into the game.** Play input into the running game step by step: hold input actions, keys, gamepad buttons and sticks, move and click the mouse, type text, wait, and read nodes at exact moments with read steps, such as the height of a jump 10 physics frames after the press, which a later call would miss. A hold of N physics frames lasts exactly N frames of the game. While game_pause holds the game, the input plays it only for its holds and waits, then pauses it again. Also check the result with game_get_properties or a screenshot right after the last step (screenshot: true). Actions must exist in the project when the game starts. Needs a game started with game_run, with or without the editor.

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
    - `click` (required): list of 2 numbers. Click at [x, y] in pixels of the game view, as in game screenshots.
    - `button`: "left", "right" or "middle". The mouse button. Default: left.
    - `double`: boolean. Double-click.
  - an object with:
    - `text` (required): string. Type this text, as into a focused LineEdit.
  - an object with:
    - `wait_ms` (required): integer from 1 to 60000. Wait this many milliseconds.
  - an object with:
    - `wait_physics_frames` (required): integer from 1 to 3600. Wait this many physics frames.
  - an object with:
    - `read` (required): string. A node of the running game to read at this moment of the input, such as "Player", as in game_get_properties.
    - `names` (required): list of strings, at least 1. Properties and getters to read, such as ["position", "velocity", "is_on_floor()"]. The result lists them with the physics frames played since the input began.
- `release_at_end`: boolean, default `true`. Release every action and key that is still held after the last step. Default: true.
- `screenshot`: boolean, default `false`. Take a screenshot of the game window right after the last step, as game_screenshot does, so that it shows the moment the input ends.

### `game_screenshot`

**Game screenshot.** See the running game: a screenshot of its window with the UI, or renders of its 3D world from other angles that leave the game camera alone. Returns the image and the path of its file. Pixel positions in a screenshot of the window are the positions that game_input clicks use. Needs a game started with game_run that has a window, with or without the editor.

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

**Game performance.** Measure how the running game performs over a number of frames: frame time and FPS, time spent in process and physics code, draw calls and primitives, memory, counts of objects and nodes with orphan nodes (a sign of leaks), and the load of 3D physics. Needs a game started with game_run, with or without the editor.

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

**Debugger state.** Show where the game stopped in the debugger and why — a breakpoint, a step or an error — with the stack of function calls, the code around the line, and the local variables and members of a stack frame. With wait_ms it first waits for the game to stop, such as after game_input made the player do what reaches the breakpoint. While the game is stopped, game_get_properties still reads nodes, but game_wait, game_input and screenshots need debug_continue first.

*Read-only*

- `wait_ms`: integer from 0 to 300000, default `0`. When the game is not stopped, wait this long for it to stop at a breakpoint, such as after game_input made the player jump. Default: 0, answer at once.
- `frame`: integer, at least 0, default `0`. The stack frame whose code and variables to show: 0 is the line where the game stopped, 1 the function that called it, and so on.

### `debug_continue`

**Continue or step.** Resume the game stopped in the debugger, until the next breakpoint, or by one line of code at a time. After a step the result shows the new line and its variables.

*Makes changes*

- `action`: "continue", "step_over" or "step_into", default `"continue"`. "continue" runs the game until the next breakpoint; "step_over" runs the current line and stops at the next one; "step_into" also stops inside the functions that the line calls. Default: "continue".

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
