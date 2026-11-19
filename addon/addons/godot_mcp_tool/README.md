# Godot MCP Tool

This is the editor addon of [Godot MCP Tool](https://github.com/facelessdiplomat/godot-mcp-tool), which lets Claude
Code make Godot 4 games through the Godot editor: it builds scenes that Ctrl+Z can undo, writes and checks GDScript,
runs the game, plays input into it and reads its errors with stack traces.

The addon connects the open editor to the `godot-mcp-tool` server, which Claude Code starts from npm. Without the
server the addon only waits for it.

You need Godot 4.7 or newer, Node.js 22 or newer and Claude Code. The
[setup guide](https://github.com/facelessdiplomat/godot-mcp-tool/blob/master/docs/setup.md) explains each step:

1. Enable **Godot MCP Tool** in Project → Project Settings → Plugins. A **Godot MCP** panel appears at the bottom of
   the editor.
2. Install the Claude Code plugin, which brings the server:

   ```bash
   claude plugin marketplace add facelessdiplomat/godot-mcp-tool
   claude plugin install godot@godot-mcp-tool
   ```

3. Start `claude` in the project folder and ask: "Check the Godot connection."

The addon and the server work together when their versions match. If Claude reports that they differ, close the
editor, run `npx godot-mcp-tool update-addon` in the project folder and open the editor again.

The Godot MCP panel shows the connection and the commands that Claude sends. One switch holds Claude's changes while
it can still read the project; the other allows the tools that run code in this project, which are off by default.

Released under the MIT license; see `LICENSE`.
