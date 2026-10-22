extends "../command.gd"

const AddonInfo := preload("../../addon_info.gd")
const AutoloadList := preload("../../project/autoload_list.gd")
const AutoloadRegistry := preload("../../editor/autoload_registry.gd")
const Params := preload("../params.gd")
const SimilarNames := preload("../../util/similar_names.gd")

var _registry: AutoloadRegistry
var _save_settings: Callable


func _init(registry: AutoloadRegistry, save_settings: Callable) -> void:
	_registry = registry
	_save_settings = save_settings


func execute(params: Dictionary) -> Variant:
	var autoload_name: Variant = Params.required_text(params, "name", "\"GameState\"")
	if autoload_name is CommandError:
		return autoload_name
	if autoload_name == AddonInfo.RUNTIME_AUTOLOAD_NAME:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is the runtime agent of the Godot MCP Tool plugin and stays while the plugin is enabled" % autoload_name, "Disabling the plugin in the project settings removes it.")
	var path := AutoloadList.path_of(autoload_name)
	if path.is_empty():
		var similar := SimilarNames.hint(autoload_name, AutoloadList.names())
		return CommandError.new(JsonRpc.NOT_FOUND, "%s is not an autoload" % autoload_name, similar if not similar.is_empty() else "project_info lists the autoloads.")
	_registry.remove(autoload_name)
	var save_error: Error = _save_settings.call()
	if save_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Removed the autoload %s, but project.godot could not be saved: %s" % [autoload_name, error_string(save_error)])
	return {"name": autoload_name, "path": path, "autoloads": AutoloadList.read()}
