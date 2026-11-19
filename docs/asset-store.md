# The Godot Asset Store listing

The addon is meant for the [Godot Asset Store](https://store.godotengine.org/), which replaced the Asset Library in
Godot 4.7. This page holds the text of the listing and the steps that submit a version. The rules come from the
[submission guide](https://docs.godotengine.org/en/4.7/community/asset_store/submitting_to_asset_store.html) and the
[guidelines](https://store.godotengine.org/guidelines/) as read on 2026-11-19. The store is in beta, so read both again
before each submission.

## What the store asks for

- The download is an archive with `addons/godot_mcp_tool/` at its root: the store does not create the `addons`
  folder when it installs an asset. The plugin folder carries a copy of the license and a README, because users keep
  that folder.
- The license of the listing matches the repository, whose `LICENSE` has the full text and a copyright line with the
  year and the holder.
- A thumbnail in 16:9 that shows the asset as it is, without slogans; for a plugin, a clear screenshot of the main
  feature, cropped to the part that matters.
- Each version gets a name, a changelog and the lowest Godot version it works in. The asset must work in that version.
- An AI usage disclosure, which the store makes mandatory when AI was used to make the asset.
- English with full sentences in the name, the summary and the description; the description cannot be just a link.
  Tags cannot repeat the name of the asset.

## The listing

**Asset name:** Godot MCP Tool

**Asset type:** Addon

**Summary:** Lets Claude Code build, run and test your Godot 4 game through the open editor, with a server from npm.

**Description:**

> Godot MCP Tool lets Claude Code, Anthropic's coding assistant, make Godot 4 games through the open Godot editor.
> Claude builds and changes scenes in the editor, where Ctrl+Z undoes its changes, writes GDScript and checks it, runs
> the game, plays input into it, reads its errors with stack traces, looks at it from several angles and stops it at
> breakpoints to find bugs.
>
> This addon is the editor half. It connects the editor to the godot-mcp-tool MCP server, which Claude Code starts
> from npm and which needs Node.js 22 or newer. Without the server the addon only waits for it. The setup guide
> explains each step: https://github.com/facelessdiplomat/godot-mcp-tool/blob/master/docs/setup.md
>
> Through the addon Claude can:
>
> - build and change scenes and resources, with each change in the editor's own Undo history;
> - check scripts and shaders with the editor's language server and shader compiler;
> - run the game, play keys, mouse and gamepad input into it, wait for a state and read nodes in the running game;
> - take screenshots of the game window, or of the 3D scene from several angles;
> - stop the game at breakpoints and read the stack and the variables;
> - run the GUT or gdUnit4 tests of the project and export it.
>
> A panel at the bottom of the editor shows the connection and the commands that Claude sends. One switch holds
> Claude's changes while it can still read the project; the tools that run code stay off unless you allow them in
> the project.
>
> Requires Godot 4.7 or newer. Scripts are GDScript; C# is not supported. Released under the MIT license.

**Tags:** ai, mcp, claude, automation, testing, editor. Before adding a tag, look whether the store already has its
singular or plural form.

**License:** MIT.

**Source code:** https://github.com/facelessdiplomat/godot-mcp-tool

**Media:** the thumbnail is a still from the recording of the README, Claude Code beside the editor, cropped to 16:9
([media/README.md](media/README.md)). The screenshots are [arena-views.jpg](media/arena-views.jpg), the views that
Claude takes of a scene, and `editor-panel.png`, the panel of the addon.

**AI usage disclosure:** yours to fill in when you submit.

## Submitting a version

1. After the release commit, pack the addon in `server/`:

   ```bash
   npm run pack:asset-store
   ```

   It writes `server/asset-store/godot-mcp-tool-<version>-asset-store.zip` from the addon files committed at `HEAD`,
   or at the commit given after the command, with `addons/godot_mcp_tool/` at the root of the archive. Files that are
   not committed never get in.
2. On the Versions tab of the listing, upload the archive. The name is the version, such as `0.3.0`; the changelog
   is the part of the release notes that concerns the editor; the lowest Godot version is 4.7, with no highest.
3. Submit it for review. A rejection comes with its reason; fix it and submit again.
