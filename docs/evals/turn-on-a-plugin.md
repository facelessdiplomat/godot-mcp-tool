# Turn on a plugin

**Request**

> There is an autosave plugin in the addons folder. Turn it on for this project.

**Starting point**

The arena, and `res://addons/autosave/` with `plugin.cfg`, `plugin.gd` and `autosave.gd`. The plugin is off. When
the editor turns it on, its `_enable_plugin()` adds the autoload `Autosave` (`autosave.gd`, a node that counts saves
on a timer every `interval` seconds, 30 by default); turning it off removes the autoload again.

**Done when**

- `project.godot` lists `res://addons/autosave/plugin.cfg` among the enabled plugins.
- `project.godot` has the autoload `Autosave`, which only the plugin adds when the editor turns it on.
- The running game has `/root/Autosave` with `interval = 30`.
- The agent turned the plugin on with `plugin_set_enabled`.

**Notes**

- Writing the plugin into `project.godot` by hand while the editor runs does not run `_enable_plugin()`, so the
  autoload is missing, and the editor may write its own list of plugins over the change.
- Automated test: `server/test/integration/milestone8Scenario.test.ts` turns GUT on through `test_install_framework`;
  `server/test/tools/pluginTools.test.ts` covers the tool.
- Evaluation run: `server/test/evals/scenarios/turnOnAPlugin.ts`.
