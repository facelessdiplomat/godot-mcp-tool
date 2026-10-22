extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")

const PROJECT_ROOT := "res://"
const ENGINE_FOLDER := "res://.godot"
const PATH_EXAMPLE := "Paths are files or folders inside the project, such as res://materials/ice.tres or res://levels/."


static func existing(path: String) -> Variant:
	var location_error := location_error(path)
	if location_error != null:
		return location_error
	if DirAccess.dir_exists_absolute(path):
		return folder(path)
	if FileAccess.file_exists(path):
		return path
	return CommandError.new(JsonRpc.NOT_FOUND, "%s not found" % path, "Check the path with the editor's FileSystem dock or editor_rescan for new files.")


static func free_location(path: String) -> Variant:
	var location_error := location_error(path)
	if location_error != null:
		return location_error
	if DirAccess.dir_exists_absolute(path) or FileAccess.file_exists(path):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s already exists" % path, "Choose a path that is free, or move the existing file away first.")
	return path


static func location_error(path: String) -> CommandError:
	var inside_project := path.begins_with(PROJECT_ROOT) and not ".." in path.trim_prefix(PROJECT_ROOT).split("/")
	if not inside_project or path.contains("::"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" is not a path inside the project" % path, PATH_EXAMPLE)
	if folder(path) == PROJECT_ROOT:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "The project folder itself cannot be used here", PATH_EXAMPLE)
	if path == ENGINE_FOLDER or path.begins_with(ENGINE_FOLDER + "/"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s belongs to the engine's cache, not to the project" % path, PATH_EXAMPLE)
	return null


static func folder(path: String) -> String:
	return path if path.ends_with("/") else path + "/"
