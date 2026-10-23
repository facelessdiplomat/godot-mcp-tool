# Using Godot MCP Tool

This guide shows how to work on a Godot game with Claude once the [setup](setup.md) is done. It takes about five
minutes to read.

## How the work goes

1. Open your project in the Godot editor and start Claude Code in the project folder.
2. Ask for what you want in plain language, as you would ask a colleague.
3. Claude does the work through the editor and the game:
   - it builds and changes scenes in the open editor, so you see each change at once, and Ctrl+Z (Cmd+Z on macOS)
     undoes it;
   - it writes GDScript files and checks them for errors;
   - it runs the game, plays input into it, reads its errors and looks at screenshots to check the result itself.
4. Look at the result, play the game yourself and ask for changes.

Changed scenes stay unsaved until Claude saves them, as in the editor; running the game saves them first.

## Example requests

Build a level:

> Build a small arena in the main scene: a 30 by 30 m floor, walls 3 m high around it, a ramp up to a 2 m high
> platform in one corner, sunlight with shadows and a sky. Check it from a few angles.

Add a player:

> Make a third-person prototype in the arena: a player that walks with WASD and jumps on Space, with a camera
> following from behind. Make sure it works.

Playtest and look at the scene:

> Play the game and check that the player can jump onto the platform. Show me the arena from the front, from above
> and at an angle.

Find and fix errors:

> When I press jump, the game prints an error and the jump sound never plays. Fix it.

> After the first hit, the enemy never takes damage again. Find out why with the debugger and fix it.

Run the tests:

> Write a GUT test for Player.dash() and run all the tests.

More ideas: import a model and scale it to 1.8 m, add a health bar or a pause menu, let the player use a gamepad,
bake navigation so an enemy follows the player, make a build of the game.

Requests work best when they say how to tell that the result is right, such as "the player lands on the
platform". Give large tasks in steps: the level first, then the player, then the enemies.

## Safety

- **Undo.** Every change Claude makes to a scene or a resource is one step of the editor's undo history, named
  "MCP: …". Scripts and other files are written to disk directly, so keep the project in Git.
- **Claude Code asks first.** Claude Code asks before it uses a tool, until you allow that tool.
- **Unsafe tools are off.** Four tools can do almost anything, so they are off by default:
  - `editor_run_script` runs GDScript code inside the editor;
  - `node_call_method` calls any method of a node;
  - `game_eval` evaluates an expression in the running game;
  - `filesystem_delete` moves project files to the system trash.

  To turn them on, set `GODOT_MCP_UNSAFE=1` for the server (see [Settings](setup.md#settings)) and allow them in
  the editor: Project → Tools → Godot MCP Tool → Allow Unsafe Tools, or the switch in the Godot MCP panel. Claude
  Code then asks you before every call of these tools.
- **Read-only mode.** With `GODOT_MCP_READ_ONLY=1` Claude can look at the project and the running game but cannot
  change anything.
- **Single tools off.** `GODOT_MCP_DISABLE` turns off the tools you name, such as `export_project`.
- **Exports stay in the project.** A build is written only into a folder inside the project, such as `build/`.

## Slash commands

The server brings two ready-made tasks. Type `/` in Claude Code and find them in the list, marked (MCP):

- **playtest** plays the game, or the scene you name after the command, and reports what works, what does not, the
  errors and the performance, without changing the project.
- **fix_last_run** hands Claude the errors of the last game run, with file, line and stack, and asks it to fix them
  and run the game again.

Their full names depend on how the server was added: `/mcp__godot__playtest` and `/mcp__godot__fix_last_run` for the
server `godot` of `.mcp.json`, and longer names with the plugin.

## Limitations

- **Screenshots need a window.** In windowless mode (`GODOT_MCP_HEADLESS=1`) Claude checks the game with numbers:
  positions, sizes and states.
- **Scenes are changed through the editor.** While the editor is open, Claude edits scenes and resources with its
  tools and not as `.tscn` or `.tres` text, which the editor would overwrite.
- **A breakpoint stops the game.** The game waits at a breakpoint until Claude continues or stops it. Script errors
  do not stop the game: Claude reads them with file, line and stack.
- **One editor per project.** When the same project is open in two editors, only the first one talks to Claude.
- **GDScript and 3D.** C# is not supported. 2D scenes can be built with the node tools, but there are no tools for
  2D, such as for TileMaps.

## All tools

The [tool reference](tools.md) lists every tool with its parameters. It is generated from the code, so it always
matches the server.
