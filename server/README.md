# godot-mcp-tool

The MCP server and command-line tool of [Godot MCP Tool](https://github.com/facelessdiplomat/godot-mcp-tool). With
it, Claude Code makes Godot 4 games through the Godot editor: it builds scenes that Ctrl+Z can undo, writes and checks
GDScript, runs the game, plays input into it and reads its errors with stack traces.

You need Godot 4.7 or newer, Node.js 22 or newer and Claude Code.

## Quick start

1. Install the editor addon into your Godot project. In the project folder, with the editor closed, run:

   ```bash
   npx godot-mcp-tool install-addon
   ```

2. Connect Claude Code. The Claude Code plugin is the best way: it also checks every GDScript file Claude writes.

   ```bash
   claude plugin marketplace add facelessdiplomat/godot-mcp-tool
   claude plugin install godot@godot-mcp-tool
   ```

   Without the plugin, add the server to the project:

   ```bash
   claude mcp add --scope project godot -- npx -y godot-mcp-tool
   ```

3. Open the project in Godot, start `claude` in the project folder and ask: "Check the Godot connection."

## Commands

```text
godot-mcp-tool                         Run the MCP server; Claude Code starts it
godot-mcp-tool install-addon [folder]  Copy the addon into the Godot project and enable its plugin
godot-mcp-tool update-addon [folder]   Replace the addon of the project with the version of this package
godot-mcp-tool doctor [folder]         Check Node.js, Godot, the addon, the plugin and the connection to the editor
godot-mcp-tool check-edited-script     Check the .gd file of a Claude Code hook input; the plugin's hook runs it
```

The folder is the Godot project: by default `GODOT_PROJECT_PATH`, or the current folder or the nearest folder above
it that has a `project.godot`.

## Documentation

- [Setup guide](https://github.com/facelessdiplomat/godot-mcp-tool/blob/master/docs/setup.md): installing, connecting,
  settings and troubleshooting.
- [Usage guide](https://github.com/facelessdiplomat/godot-mcp-tool/blob/master/docs/usage.md): example requests,
  safety and limitations.
- [Tool reference](https://github.com/facelessdiplomat/godot-mcp-tool/blob/master/docs/tools.md): every tool with its
  parameters.
- [Security](https://github.com/facelessdiplomat/godot-mcp-tool/blob/master/SECURITY.md): how to report a problem and
  how the tool protects your project.

## License

[MIT](https://github.com/facelessdiplomat/godot-mcp-tool/blob/master/LICENSE)
