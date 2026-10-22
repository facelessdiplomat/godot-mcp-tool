export const serverInstructions = [
  'Tools for building a Godot 4 game (3D, GDScript) through the running Godot editor.',
  '- Start with godot_status. If the editor is not connected, ask the user to open the project in Godot with the "Godot MCP Tool" plugin enabled; game_run still works without it.',
  '- Call project_info once per session: main scene, autoloads, global classes, and the indentation of .gd files. Never mix tabs and spaces.',
  '- Write GDScript for Godot 4 only: @export, @onready, await, signal.connect(callable), CharacterBody3D, Node3D.',
  '- While the editor is connected, change scenes only with the scene_ and node_ tools, never by editing .tscn or .tres files as text. Edit .gd files with your own file tools; after creating or changing scripts that scenes use, call editor_rescan.',
  '- Learn node paths with scene_get_tree before changing a scene. rotation is in radians; use rotation_degrees for degrees.',
  '- Changes stay unsaved until scene_save, as in the editor. Save when a logical change is complete; game_run saves first, like the editor does.',
  '- After writing or changing .gd files, check them with script_validate before running. Then check the result with game_run and read errors with game_get_output.',
  '- When a result reports new errors (⚠), read them with game_get_output before you continue.',
].join('\n');
