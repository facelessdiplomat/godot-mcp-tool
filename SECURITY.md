# Security

## Reporting a problem

Please report security problems privately, not in a public issue: open the **Security** tab of this repository on
GitHub and choose **Report a vulnerability**. Tell us:

- what the problem is and what an attacker could do with it;
- how to reproduce it;
- the versions of Godot MCP Tool, Godot and Claude Code, and your operating system.

You get an answer within a week. We fix the problem in a new release and credit you in its notes, unless you would
rather not be named.

## Supported versions

Godot MCP Tool is young: only the latest release gets security fixes.

## How the tool protects your computer and project

- **The bridge stays on your machine.** The addon listens on `127.0.0.1` only, never on other network interfaces.
- **A token guards the bridge.** A client must present a random 128-bit token first; the addon compares it in
  constant time. The token is in `.godot/godot_mcp_tool/bridge.json`, which only your user can read.
- **No web access.** The bridge speaks newline-delimited JSON over TCP, not HTTP, so a web page cannot talk to it.
- **Games check their server too.** A game started without the editor connects back to the server on `127.0.0.1`
  with a token of its own, which it gets through its environment, not its command line. In an exported release build
  the agent inside the game does nothing.
- **Files stay in the project.** Paths must lead inside the project; `..`, absolute paths and links that lead out are
  refused. An export writes only into a folder of its own inside the project.
- **No shell.** The server starts Godot and other processes directly, never through a shell.
- **Unsafe tools need two switches.** `editor_run_script`, `node_call_method`, `game_eval` and `filesystem_delete`
  are off unless the server runs with `GODOT_MCP_UNSAFE=1` and the project allows them in the editor (Project →
  Tools → Godot MCP Tool → Allow Unsafe Tools, kept for one user and one project). Claude Code then asks before
  every call.
- **Nothing leaves your machine.** No telemetry and no network access beyond `127.0.0.1`. Only `npx` downloads the
  package from npm, and the Claude Code plugin asks for one fixed version of it.

## What counts as a security problem

- Another program, user or web page that controls the editor or a game through the addon, reads the token, or
  reaches the bridge from another machine.
- A path in the arguments of a tool that reads or writes a file outside the project.
- A tool that runs code given in its arguments while the unsafe tools are off.
- An unsafe tool that works while one of its two switches is off.

What Claude does with the tools you allowed, such as deleting nodes you asked it to delete, is not a security
problem of this project. Problems in Godot or Claude Code themselves belong to those projects.
