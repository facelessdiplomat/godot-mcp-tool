# Evaluation scenarios

Each file here is one realistic task for Claude Code with the godot MCP server, written so that anyone can run it
again and tell whether it passed. Together they check that every capability works in the hands of the agent, not only
in the tests, and they guide the tuning of tool descriptions (§13 of the development plan).

A scenario has four parts:

- **Request** — what the user types, word for word.
- **Starting point** — the project and the files the task begins with.
- **Done when** — results that can be checked with tools or by reading files, never "looks right".
- **Notes** — the tools a good run uses and the mistakes it should avoid.

When running one, record whether it passed, the number of tool calls and the tokens used.

| Scenario | Capability | Automated test |
|---|---|---|
| [import-a-character.md](import-a-character.md) | `asset_import_settings_get`, `asset_import_settings_set` | `server/test/integration/assetImport.test.ts` |
| [follow-the-player.md](follow-the-player.md) | `navigation_bake` | `server/test/integration/navigationBake.test.ts` |
