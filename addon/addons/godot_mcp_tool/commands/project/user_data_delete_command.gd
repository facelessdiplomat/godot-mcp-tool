extends "../command.gd"

const GodotMcpFileTrash := preload("../../editor/file_trash.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpUserPaths := preload("../../files/user_paths.gd")

var _trash: GodotMcpFileTrash


func _init(trash: GodotMcpFileTrash) -> void:
	_trash = trash


func execute(params: Dictionary) -> Variant:
	var paths: Variant = GodotMcpParams.text_list(params, "paths")
	if paths is GodotMcpCommandError:
		return paths
	if (paths as Array).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"paths\" needs at least one file or folder", "Example: {\"paths\": [\"user://save.json\"]}")
	var targets: Array[String] = []
	for requested in paths:
		var path: Variant = GodotMcpUserPaths.normalized(requested)
		if path is GodotMcpCommandError:
			return path
		if path == GodotMcpUserPaths.ROOT:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "The whole folder of the user data cannot be deleted at once", "Name the files and folders inside it, which user_data_get lists.")
		targets.append(path)
	var deleted: Array = []
	var missing: Array = []
	var failed: Array = []
	for path in targets:
		if not FileAccess.file_exists(path) and not DirAccess.dir_exists_absolute(path):
			missing.append(path)
			continue
		var error := _trash.move_to_trash(ProjectSettings.globalize_path(path))
		if error == OK:
			deleted.append(path)
		else:
			failed.append({"path": path, "reason": error_string(error)})
	return {"folder": OS.get_user_data_dir(), "deleted": deleted, "missing": missing, "failed": failed}
