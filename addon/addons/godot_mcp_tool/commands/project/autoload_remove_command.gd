extends "../command.gd"

const GodotMcpAddonInfo := preload("../../addon_info.gd")
const GodotMcpAutoloadList := preload("../../project/autoload_list.gd")
const GodotMcpAutoloadRegistry := preload("../../editor/autoload_registry.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSimilarNames := preload("../../util/similar_names.gd")

var _registry: GodotMcpAutoloadRegistry
var _save_settings: Callable


func _init(registry: GodotMcpAutoloadRegistry, save_settings: Callable) -> void:
	_registry = registry
	_save_settings = save_settings


func execute(params: Dictionary) -> Variant:
	var autoload_name: Variant = GodotMcpParams.required_text(params, "name", "\"GameState\"")
	if autoload_name is GodotMcpCommandError:
		return autoload_name
	if autoload_name == GodotMcpAddonInfo.RUNTIME_AUTOLOAD_NAME:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is the runtime agent of the Godot MCP Tool plugin and stays while the plugin is enabled" % autoload_name, "Disabling the plugin in the project settings removes it.")
	var path := GodotMcpAutoloadList.path_of(autoload_name)
	if path.is_empty():
		var similar := GodotMcpSimilarNames.hint(autoload_name, GodotMcpAutoloadList.names())
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s is not an autoload" % autoload_name, similar if not similar.is_empty() else "project_info lists the autoloads.")
	_registry.remove(autoload_name)
	var save_error: Error = _save_settings.call()
	if save_error != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Removed the autoload %s, but project.godot could not be saved: %s" % [autoload_name, error_string(save_error)])
	return {"name": autoload_name, "path": path, "autoloads": GodotMcpAutoloadList.read()}
