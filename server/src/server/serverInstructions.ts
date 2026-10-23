export const serverInstructions = [
  'Tools for building a Godot 4 game (3D, GDScript) through the running Godot editor.',
  '- Start with godot_status. If the editor is not connected, start it with editor_launch, or ask the user to open the project in Godot with the "Godot MCP Tool" plugin enabled; game_run, the other game_ tools and the docs tools work without it.',
  '- Call project_info once per session: main scene, autoloads, global classes, and the indentation of .gd files. Never mix tabs and spaces.',
  '- Write GDScript for Godot 4 only: @export, @onready, await, signal.connect(callable), CharacterBody3D, Node3D. When unsure about an engine API, read it with docs_class (or find it with docs_search) before writing code: it is the reference of the installed Godot build.',
  '- While the editor is connected, change scenes and resources only with the scene_, node_ and resource_ tools, never by editing .tscn or .tres files as text. Edit .gd files with your own file tools; after creating or changing scripts that scenes use, call editor_rescan.',
  '- Move or rename project files with filesystem_move rather than shell commands: it updates the scenes, resources and project settings that use them. Check what uses a file with resource_find_usages.',
  '- Learn node paths with scene_get_tree or node_find before changing a scene. rotation is in radians; use rotation_degrees for degrees.',
  '- Build or rework a scene with scene_batch_edit: many node and signal changes in one call and one Undo step, and nothing changes if one of them fails. Connect signals with signal_connect once the method exists in the script.',
  '- Changes stay unsaved until scene_save, as in the editor. Save when a logical change is complete; game_run saves first, like the editor does.',
  '- After writing or changing .gd files, check them with script_validate before running. Then check the result with game_run and read errors with game_get_output. Run the GUT or gdUnit4 tests of the project with test_run.',
  '- To check how the running game behaves, play input with game_input (actions come from input_map_set), wait for a state with game_wait and read nodes with game_get_properties; getters such as is_on_floor() work there; game_pause freezes the game and game_step advances it by exact physics frames. Tool calls sent in one message run at the same time, so read the state in a later message than the game_input or game_wait it depends on.',
  '- Check 3D placement and scale with numbers first (node_get_bounds), then look: game_screenshot shows the game window or views of its 3D world, editor_screenshot renders the open scene. One picture of a 3D scene can mislead, so use views from several angles, such as ["front", "top", "iso"].',
  '- Imported models often arrive in centimeters: read their size with asset_import_settings_get and fix it with nodes/root_scale in asset_import_settings_set rather than by scaling nodes.',
  '- To find out why game code misbehaves, stop it on a line with debug_breakpoints and game_run, then read the stack and the variables with debug_state and step with debug_continue; remove the breakpoints when done.',
  '- When a result reports new errors (⚠), read them with game_get_output before you continue.',
].join('\n');

export const readOnlyInstructions = '- This server runs in read-only mode: the tools that change the project or the game are left out.';

export const unsafeInstructions = [
  '- editor_run_script, game_eval and node_call_method are on: they run code in the editor or the game, and the user confirms each call. Use them only when no other tool fits; apart from node_call_method, their changes are not in the Undo history.',
  '- Delete project files with filesystem_delete rather than shell commands: it keeps files that are still in use and moves the others to the trash; the user confirms each call.',
].join('\n');
