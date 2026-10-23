# Godot MCP Tool

Godot MCP Tool lets Claude Code make Godot 4 games through the Godot editor. Claude builds and changes scenes in the
open editor, where Ctrl+Z undoes its changes, writes GDScript and checks it, runs the game, plays input into it,
reads its errors with stack traces, looks at it from several angles and stops it at breakpoints to find bugs.

> Status: in development and not published yet; the commands below work once the npm package and this repository
> are public. See the [development plan](docs/DEVELOPMENT_PLAN.md).

## Quick start

You need Godot 4.7 or newer, Node.js 22 or newer and Claude Code.

1. Install the addon into your Godot project. In the project folder, with the editor closed, run:

   ```bash
   npx godot-mcp-tool install-addon
   ```

2. Install the Claude Code plugin:

   ```bash
   claude plugin marketplace add facelessdiplomat/godot-mcp-tool
   claude plugin install godot@godot-mcp-tool
   ```

3. Open the project in Godot, start `claude` in the project folder and ask: "Check the Godot connection."
4. Ask for something to build: "Build a small arena with walls and a ramp, and show it from a few angles."

The [setup guide](docs/setup.md) explains each step and what to do when something does not work, the
[usage guide](docs/usage.md) shows how to work with Claude, and the [tool reference](docs/tools.md) lists every
tool.

## Repository layout

- `server/` — the MCP server (TypeScript, stdio) and the `godot-mcp-tool` npm package.
- `addon/addons/godot_mcp_tool/` — the Godot editor addon.
- `plugin/` — the Claude Code plugin; `.claude-plugin/marketplace.json` makes this repository its marketplace.
- `test-project/` — a Godot project used by the tests.
- `docs/` — the user guides, the tool reference, the plan and design notes.

## Development

Requirements: Node.js 22 or newer, Godot 4.7 or newer.

```bash
cd server
npm install
npm test
npm run build
```

The tests that need Godot take its path in `GODOT_BIN`: `scripts/install-gut.sh` and `scripts/install-gdunit4.sh`
install the test frameworks into `test-project/`, `scripts/test-addon.sh` runs the addon tests, and
`npm run test:integration` in `server/` runs the integration tests. After changing a tool, `npm run docs:tools`
updates the [tool reference](docs/tools.md).

## License

[MIT](LICENSE)
