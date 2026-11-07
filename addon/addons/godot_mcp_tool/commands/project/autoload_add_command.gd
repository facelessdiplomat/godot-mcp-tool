extends "../command.gd"

const GodotMcpAutoloadList := preload("../../project/autoload_list.gd")
const GodotMcpAutoloadNames := preload("../../project/autoload_names.gd")
const GodotMcpAutoloadRegistry := preload("../../editor/autoload_registry.gd")
const GodotMcpParams := preload("../params.gd")

const AUTOLOAD_EXTENSIONS := ["gd", "tscn", "scn"]

var _registry: GodotMcpAutoloadRegistry
var _save_settings: Callable


func _init(registry: GodotMcpAutoloadRegistry, save_settings: Callable) -> void:
	_registry = registry
	_save_settings = save_settings


func execute(params: Dictionary) -> Variant:
	var autoload_name: Variant = GodotMcpParams.required_text(params, "name", "\"GameState\"")
	var path: Variant = GodotMcpParams.required_text(params, "path", "\"res://autoload/game_state.gd\"")
	for value in [autoload_name, path]:
		if value is GodotMcpCommandError:
			return value
	var name_problem := GodotMcpAutoloadNames.problem_with(autoload_name)
	if not name_problem.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s cannot be an autoload name: %s" % [autoload_name, name_problem], "Autoload names are usually in PascalCase, such as GameState.")
	var registered_path := GodotMcpAutoloadList.path_of(autoload_name)
	if not registered_path.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is already an autoload: %s" % [autoload_name, registered_path], "Remove it first with autoload_remove, or pick another name.")
	var path_problem := _path_problem(path)
	if path_problem != null:
		return path_problem
	_registry.add(autoload_name, path)
	var save_error: Error = _save_settings.call()
	if save_error != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Added the autoload %s, but project.godot could not be saved: %s" % [autoload_name, error_string(save_error)])
	return {"name": autoload_name, "path": path, "autoloads": GodotMcpAutoloadList.read()}


static func _path_problem(path: String) -> GodotMcpCommandError:
	var inside_project := path.begins_with("res://") and not ".." in path.trim_prefix("res://").split("/")
	if not inside_project or not path.get_extension() in AUTOLOAD_EXTENSIONS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" is not a script or scene in the project" % path, "Autoloads are scripts or scenes, such as res://autoload/game_state.gd.")
	if not FileAccess.file_exists(path) and not ResourceLoader.exists(path):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s does not exist" % path, "Write the script first, then call editor_rescan.")
	if path.get_extension() != "gd":
		return null
	var script := load(path) as Script
	var base_type: StringName = script.get_instance_base_type() if script != null else &""
	if base_type.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s could not be loaded" % path, "Check it with script_validate.")
	if not ClassDB.is_parent_class(base_type, "Node"):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s does not extend Node, so it cannot be an autoload" % path, "Autoload scripts extend Node or one of its subclasses.")
	return null
