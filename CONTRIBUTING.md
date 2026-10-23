# Contributing to Godot MCP Tool

Thank you for helping. This page tells how the project fits together, how to run its checks and what a change needs
before it is merged. Report security problems as [SECURITY.md](SECURITY.md) says, not in public issues.

## How it fits together

- `server/` is the MCP server in TypeScript and the npm package `godot-mcp-tool`. Each tool in `server/src/tools/`
  has a zod schema and a description; most tools forward a JSON-RPC method, such as `project.info`, to the addon.
- `addon/addons/godot_mcp_tool/` is the Godot editor addon in GDScript. Its bridge listens on 127.0.0.1 and runs one
  command class per method from `commands/`; the agent in `runtime/` runs inside the game.
- `plugin/` is the Claude Code plugin: the server, a hook that checks every `.gd` file Claude writes, and the `godot`
  skill.
- `test-project/` is the Godot project of the addon tests; the addon is linked into it.
- `docs/` holds the user guides, the generated [tool reference](docs/tools.md), the
  [development plan](docs/DEVELOPMENT_PLAN.md) with the design and its decisions, and the
  [evaluation scenarios](docs/evals/README.md).

## Set up

You need Node.js 22 or newer and Godot 4.7 or newer. The checks that start Godot take its executable in `GODOT_BIN`.

```bash
cd server
npm install
npm run build
```

Install the test frameworks into the test project once, from the repository root:

```bash
scripts/install-gut.sh
scripts/install-gdunit4.sh
```

## Run the checks

In `server/`:

```bash
npm run lint
npm run typecheck
npm test
```

The addon tests (GUT), from the repository root:

```bash
GODOT_BIN=/path/to/Godot scripts/test-addon.sh
```

The integration tests in `server/` start headless Godot editors and games and take about three minutes:

```bash
GODOT_BIN=/path/to/Godot npm run test:integration
```

With `GODOT_MCP_WINDOW_TESTS=1` they also run the tests that open Godot windows for screenshots.

CI runs the same checks on Linux with Godot 4.7.2 and with the pinned `master` commit of the engine
([ci.yml](.github/workflows/ci.yml)); the window tests run only on your machine.

## Rules for the code

The rules live in [CLAUDE.md](CLAUDE.md), which Claude Code follows in this repository too.

- **No comments in source code.** Names of variables, functions, classes and files explain the code; when a piece of
  code needs a comment, rename or restructure it. Tool descriptions and schema `.describe()` texts are not
  comments: the model reads them, so write them with the same care as code. `npm run lint` checks both languages.
- **Test first.** Write a failing test, then the code that makes it pass, then tidy up: vitest in `server/`, GUT for
  the classes of the addon, and an integration test when the code needs a real editor or game.
- **Types everywhere.** TypeScript in strict mode; GDScript with static types. Addon scripts are loaded through
  `preload` constants instead of `class_name`, so they never clash with the classes of a game.
- **English.** Code, descriptions and documents are in English.

## Changing a tool

1. Start with a test: a unit test of the tool in `server/test/tools/` against a fake editor, a GUT test of the
   addon command in `test-project/tests/unit/`, and an integration test when the tool talks to a real editor.
2. Write the description for the model: what the tool does, when to use it and what it returns, in plain words.
   Mark tools that only read with `readingAnnotations` and the others with `changingAnnotations`.
3. Run `npm run docs:tools` in `server/`, so that [docs/tools.md](docs/tools.md) shows the change. `npm test` fails
   until it does.
4. When the change matters for how Claude works, run the evaluation scenarios that use the tool
   ([docs/evals/README.md](docs/evals/README.md)). They are real Claude Code sessions on your account, so they cost
   money; `EVAL_REFERENCE=1` checks the scenarios without an agent for free.

## Try a change in Claude Code

The `.mcp.json` of the repository connects Claude Code to `test-project/` through `server/dist`:

1. Run `npm run build` in `server/`.
2. Open `test-project/` in the Godot editor.
3. Start `claude` in the repository root and ask it to check the Godot connection.

After a new build, reconnect the `godot` server in `/mcp`, and reopen the editor when the addon changed.

## The Godot version

The minimum is Godot 4.7 (ADR-11 in the plan). The primary target is a pinned `master` commit of the engine, recorded
in [docs/spikes.md](docs/spikes.md) and as `GODOT_MASTER_COMMIT` in the CI workflow. Update it on purpose: rebuild
Godot, run all the checks, then record the new commit in both places.

## Pull requests

- One logical change per pull request, with its tests and documentation.
- All checks pass; CI runs them for every pull request.
- The description says what changes and why.
- Contributions are licensed under the [MIT License](LICENSE), like the project.
