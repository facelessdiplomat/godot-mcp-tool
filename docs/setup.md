# Setting up Godot MCP Tool

Godot MCP Tool connects Claude Code to the Godot editor and to your running game. In about five minutes you install
the addon into your game project, connect Claude Code to it and check that they talk to each other. Then read the
[usage guide](usage.md).

## 1. What you need

- **Godot 4.7 or newer** (tested on 4.7 and 4.8). On an older Godot the plugin says which version it needs and does
  nothing else.
- **Node.js 22 or newer.** Check with `node --version`.
- **Claude Code.**
- **A Godot project**: a folder with a `project.godot` file. Scripts are GDScript; C# is not supported.

## 2. Install the addon into your project

1. Close the Godot editor if your project is open in it.
2. In a terminal, go to the project folder, the one with `project.godot`, and run:

   ```bash
   npx godot-mcp-tool install-addon
   ```

   It copies the addon into `addons/godot_mcp_tool/` and enables its plugin in `project.godot`.
3. Open the project in Godot. A **Godot MCP** panel appears at the bottom of the editor, next to Output, and shows
   `Bridge: listening on 127.0.0.1:…`.

If the panel does not appear, enable **Godot MCP Tool** in Project → Project Settings → Plugins.

## 3. Connect Claude Code

### With the Claude Code plugin (recommended)

The plugin brings the server, a hook that checks every GDScript file Claude writes, and a skill that teaches Claude
the Godot workflow.

1. Add the marketplace and install the plugin from a terminal:

   ```bash
   claude plugin marketplace add facelessdiplomat/godot-mcp-tool
   claude plugin install godot@godot-mcp-tool
   ```

   Inside Claude Code the same works with `/plugin marketplace add facelessdiplomat/godot-mcp-tool` and
   `/plugin install godot@godot-mcp-tool`. The plugin is installed for your user, so it is there in every project.
2. Tell the plugin where Godot is, unless Godot is on `PATH` or in its standard place
   (`/Applications/Godot.app` on macOS, `/usr/bin/godot` or `/usr/local/bin/godot` on Linux). The plugin calls this
   option `godot_path`. When you install the plugin inside Claude Code, it asks for it; from a terminal, add it to
   the install command:

   ```bash
   claude plugin install godot@godot-mcp-tool --config godot_path=/path/to/Godot
   ```

   You can change it later with `/plugin configure godot@godot-mcp-tool` in Claude Code. While the editor is open,
   the server finds Godot through the editor, so you can also leave it empty.
3. Start Claude Code in your project folder:

   ```bash
   cd path/to/your-game
   claude
   ```

### Without the plugin

Add the server to the project from its folder:

```bash
claude mcp add --scope project godot -- npx -y godot-mcp-tool
```

This writes a `.mcp.json` file into the project; Claude Code asks you once to approve the servers it lists. When
Godot is not on `PATH` or in its standard place, give its path:

```bash
claude mcp add --scope project godot -e GODOT_BIN=/path/to/Godot -- npx -y godot-mcp-tool
```

You can also write `.mcp.json` yourself:

```json
{
  "mcpServers": {
    "godot": {
      "command": "npx",
      "args": ["-y", "godot-mcp-tool"],
      "env": { "GODOT_BIN": "/Applications/Godot.app/Contents/MacOS/Godot" }
    }
  }
}
```

Without the plugin you get every tool, but neither the hook nor the skill. Use either the plugin or this server,
not both.

## 4. Check the connection

1. Open the project in the Godot editor.
2. Start Claude Code in the project folder and ask: **"Check the Godot connection."**
3. Claude runs `godot_status` and reports something like this:

   ```text
   Project: /Users/you/games/arena (from working directory)
   Editor: connected. Godot 4.7.2.stable.official.ed1daf0bf, addon 0.1.0, bridge protocol 1
   Godot binary: /Applications/Godot.app/Contents/MacOS/Godot (from running editor), version 4.7.2.stable.official.ed1daf0bf
   ```

You can check the whole setup from a terminal as well. Run this in the project folder:

```bash
npx godot-mcp-tool doctor
```

```text
Checking the setup of Godot MCP Tool 0.1.0:
ok       Node.js 22.12.0
ok       Project /Users/you/games/arena (from working directory)
ok       Godot 4.7.2.stable.official.ed1daf0bf at /Applications/Godot.app/Contents/MacOS/Godot (from running editor)
ok       Addon 0.1.0 in /Users/you/games/arena/addons/godot_mcp_tool
ok       Plugin enabled in /Users/you/games/arena/project.godot
ok       Editor connected: Godot 4.7.2.stable.official.ed1daf0bf, addon 0.1.0
Everything is set up.
```

## 5. When something does not work

Start with `npx godot-mcp-tool doctor` in the project folder: it checks each part and says how to fix what is wrong.

- **Claude has no Godot tools.** Type `/mcp` in Claude Code and look for the server: `godot`, or
  `plugin:godot:godot` with the plugin. Reconnect it there; if it fails again, run `doctor`.
- **The editor is not connected.** Open the project in the Godot editor and look at the Godot MCP panel. If there is
  no panel, enable the plugin in Project → Project Settings → Plugins. Claude can also start the editor itself: ask
  it to "start the Godot editor".
- **Godot is not found.** Give its path: the `godot_path` option of the plugin, or `GODOT_BIN` in `.mcp.json`. On
  macOS the path ends in `Godot.app/Contents/MacOS/Godot`.
- **Godot is too old.** The Output panel of the editor shows "Godot MCP Tool needs Godot 4.7 or newer". Open the
  project in Godot 4.7 or newer.
- **The addon and the server have different versions.** `godot_status` and `doctor` say so. Close the editor, run
  `npx godot-mcp-tool update-addon` in the project folder and open the editor again.
- **Another editor already serves the project.** Only one editor per project talks to Claude; the panel of the
  other one says `off: the editor in process … already serves this project`. Close the editor you don't need.
- **No project is found.** Start Claude Code in the project folder, or set `GODOT_PROJECT_PATH` to it.

## Settings

The server reads these environment variables. In `.mcp.json` put them under `env` of the `godot` server. With the
plugin, Godot's path is the `godot_path` option, and the server takes the others from the environment of Claude Code:
start it with the variable, such as `GODOT_MCP_READ_ONLY=1 claude`, or add the variable under `env` in
`~/.claude/settings.json`.

| Variable | What it does |
|---|---|
| `GODOT_BIN` | The Godot executable, when the server does not find it by itself. |
| `GODOT_PROJECT_PATH` | The project folder, when Claude Code runs somewhere else. |
| `GODOT_MCP_HEADLESS=1` | Windowless mode: games and the editor that Claude starts run without a window, so there are no screenshots. For servers and CI. |
| `GODOT_MCP_READ_ONLY=1` | Read-only mode: only the tools that read are available. |
| `GODOT_MCP_UNSAFE=1` | Turns on the four unsafe tools; see [Safety](usage.md#safety). |
| `GODOT_MCP_DISABLE` | Tools to turn off, separated by commas, such as `export_project,filesystem_move`. |
| `GODOT_LSP_PORT`, `GODOT_DAP_PORT` | The ports of the editor's GDScript language server and debug adapter, when the editor uses others than in its settings, such as an editor started with `--lsp-port`. |
| `GODOT_MCP_CACHE_DIR` | Where the server keeps the class reference it reads from Godot. |
