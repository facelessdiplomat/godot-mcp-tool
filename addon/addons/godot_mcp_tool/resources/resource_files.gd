extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")

const SAVED_EXTENSIONS := ["tres", "res"]
const PATH_EXAMPLE := "Resource paths look like res://materials/ice.tres."


static func validate_new_path(resource_path: String) -> CommandError:
	var location_error := _validate_location(resource_path)
	if location_error != null:
		return location_error
	if not resource_path.get_extension() in SAVED_EXTENSIONS:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" is not a resource file path" % resource_path, "Resource files end with .tres, such as res://materials/ice.tres.")
	if FileAccess.file_exists(resource_path) or ResourceLoader.exists(resource_path):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s already exists" % resource_path, "Change it with resource_set_properties, or choose another path.")
	return null


static func load_existing(resource_path: String) -> Variant:
	var location_error := _validate_location(resource_path)
	if location_error != null:
		return location_error
	if not ResourceLoader.exists(resource_path):
		return CommandError.new(JsonRpc.NOT_FOUND, "Resource %s not found" % resource_path, "Create it with resource_create, or check the path.")
	var resource := load(resource_path)
	if resource == null:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "%s could not be loaded" % resource_path, "Read the errors with game_get_output.")
	if resource is PackedScene:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is a scene" % resource_path, "Read scenes with scene_get_tree and change them with the scene_ and node_ tools.")
	if resource is Script:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is a script" % resource_path, "Read and edit scripts as text files.")
	return resource


static func load_changeable(resource_path: String) -> Variant:
	var location_error := _validate_location(resource_path)
	if location_error != null:
		return location_error
	if FileAccess.file_exists(resource_path + ".import"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is imported, so Godot builds it from the source file" % resource_path, "Change its import settings with asset_import_settings_set instead.")
	return load_existing(resource_path)


static func dependencies_of(resource_path: String) -> Array:
	var dependency_paths: Array = []
	for dependency in ResourceLoader.get_dependencies(resource_path):
		var dependency_path := _path_in(dependency)
		if not dependency_path.is_empty() and not dependency_path in dependency_paths:
			dependency_paths.append(dependency_path)
	return dependency_paths


static func _path_in(dependency: String) -> String:
	var parts := dependency.split("::")
	for part in parts:
		if part.begins_with("res://"):
			return part
	for part in parts:
		if part.begins_with("uid://") and ResourceUID.has_id(ResourceUID.text_to_id(part)):
			return ResourceUID.get_id_path(ResourceUID.text_to_id(part))
	return ""


static func _validate_location(resource_path: String) -> CommandError:
	var inside_project := resource_path.begins_with("res://") and not ".." in resource_path.trim_prefix("res://").split("/")
	if not inside_project or resource_path.contains("::"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" is not a resource file in the project" % resource_path, PATH_EXAMPLE)
	return null
