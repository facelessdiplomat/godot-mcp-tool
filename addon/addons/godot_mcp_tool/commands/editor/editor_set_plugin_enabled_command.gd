extends "../command.gd"

const GodotMcpAutoloadList := preload("../../project/autoload_list.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpPluginAccess := preload("../../editor/plugin_access.gd")
const GodotMcpSimilarNames := preload("../../util/similar_names.gd")

const OWN_PLUGIN := "godot_mcp_tool"
const PLUGIN_PATH_PREFIX := "res://addons/"
const PLUGIN_PATH_SUFFIX := "/plugin.cfg"

var _plugins: GodotMcpPluginAccess
var _save_settings: Callable


func _init(plugins: GodotMcpPluginAccess, save_settings: Callable) -> void:
	_plugins = plugins
	_save_settings = save_settings


func execute(params: Dictionary) -> Variant:
	var requested: Variant = GodotMcpParams.required_text(params, "plugin", "\"gut\", the folder of the plugin in res://addons")
	var enabled: Variant = GodotMcpParams.flag(params, "enabled", true)
	for value in [requested, enabled]:
		if value is GodotMcpCommandError:
			return value
	var name := (requested as String).trim_prefix(PLUGIN_PATH_PREFIX).trim_suffix(PLUGIN_PATH_SUFFIX).trim_suffix("/")
	var known := _plugins.names()
	if not name in known:
		var similar := GodotMcpSimilarNames.hint(name, Array(known))
		var listed := "Plugins in res://addons: %s." % ", ".join(known) if not known.is_empty() else "res://addons has no plugin with a plugin.cfg."
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "There is no plugin \"%s\" in res://addons" % name, similar if not similar.is_empty() else listed)
	if name == OWN_PLUGIN and not enabled:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Turning off the Godot MCP Tool plugin would cut the connection these tools work through", "Turn it off in Project Settings → Plugins when you are done.")
	var was_enabled := _plugins.is_enabled(name)
	if was_enabled != enabled:
		_plugins.set_enabled(name, enabled)
		var save_error: Error = _save_settings.call()
		if save_error != OK:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Turned the plugin %s %s, but project.godot could not be saved: %s" % [name, "on" if enabled else "off", error_string(save_error)])
	var now_enabled := _plugins.is_enabled(name)
	return {
		"plugin": name,
		"enabled": now_enabled,
		"changed": was_enabled != now_enabled,
		"autoloads_left": [] if now_enabled else _autoloads_inside(PLUGIN_PATH_PREFIX + name + "/"),
		"plugins": Array(known).map(func(plugin: String) -> Dictionary: return {"name": plugin, "enabled": _plugins.is_enabled(plugin)}),
	}


static func _autoloads_inside(folder: String) -> Array:
	var inside: Array = []
	for autoload: Dictionary in GodotMcpAutoloadList.read():
		if (autoload["path"] as String).begins_with(folder):
			inside.append({"name": autoload["name"], "path": autoload["path"]})
	return inside
