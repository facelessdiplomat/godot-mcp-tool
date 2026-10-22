extends "../command.gd"

const AutoloadList := preload("../../project/autoload_list.gd")
const AutoloadNames := preload("../../project/autoload_names.gd")
const AutoloadRegistry := preload("../../editor/autoload_registry.gd")
const Params := preload("../params.gd")

const AUTOLOAD_EXTENSIONS := ["gd", "tscn", "scn"]

var _registry: AutoloadRegistry
var _save_settings: Callable


func _init(registry: AutoloadRegistry, save_settings: Callable) -> void:
	_registry = registry
	_save_settings = save_settings


func execute(params: Dictionary) -> Variant:
	var autoload_name: Variant = Params.required_text(params, "name", "\"GameState\"")
	var path: Variant = Params.required_text(params, "path", "\"res://autoload/game_state.gd\"")
	for value in [autoload_name, path]:
		if value is CommandError:
			return value
	var name_problem := AutoloadNames.problem_with(autoload_name)
	if not name_problem.is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s cannot be an autoload name: %s" % [autoload_name, name_problem], "Autoload names are usually in PascalCase, such as GameState.")
	var registered_path := AutoloadList.path_of(autoload_name)
	if not registered_path.is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is already an autoload: %s" % [autoload_name, registered_path], "Remove it first with autoload_remove, or pick another name.")
	var path_problem := _path_problem(path)
	if path_problem != null:
		return path_problem
	_registry.add(autoload_name, path)
	var save_error: Error = _save_settings.call()
	if save_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Added the autoload %s, but project.godot could not be saved: %s" % [autoload_name, error_string(save_error)])
	return {"name": autoload_name, "path": path, "autoloads": AutoloadList.read()}


static func _path_problem(path: String) -> CommandError:
	var inside_project := path.begins_with("res://") and not ".." in path.trim_prefix("res://").split("/")
	if not inside_project or not path.get_extension() in AUTOLOAD_EXTENSIONS:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" is not a script or scene in the project" % path, "Autoloads are scripts or scenes, such as res://autoload/game_state.gd.")
	if not FileAccess.file_exists(path) and not ResourceLoader.exists(path):
		return CommandError.new(JsonRpc.NOT_FOUND, "%s does not exist" % path, "Write the script first, then call editor_rescan.")
	if path.get_extension() != "gd":
		return null
	var script := load(path) as Script
	var base_type: StringName = script.get_instance_base_type() if script != null else &""
	if base_type.is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s could not be loaded" % path, "Check it with script_validate.")
	if not ClassDB.is_parent_class(base_type, "Node"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s does not extend Node, so it cannot be an autoload" % path, "Autoload scripts extend Node or one of its subclasses.")
	return null
