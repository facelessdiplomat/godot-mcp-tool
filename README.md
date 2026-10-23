# godot-mcp-tool

An MCP server that lets Claude Code work inside the Godot editor: build scenes, run the game, read errors with stack
traces, take screenshots and simulate input.

> Status: early development (milestone 0). See the [development plan](docs/DEVELOPMENT_PLAN.md).

## Repository layout

- `server/` — the MCP server (TypeScript, stdio).
- `addon/addons/godot_mcp_tool/` — the Godot editor addon.
- `test-project/` — a Godot project used by the integration tests.
- `docs/` — the plan and design notes.

## Development

Requirements: Node.js 22 or newer, Godot 4.7 or newer.

```bash
cd server
npm install
npm test
npm run build
```

## License

[MIT](LICENSE)
