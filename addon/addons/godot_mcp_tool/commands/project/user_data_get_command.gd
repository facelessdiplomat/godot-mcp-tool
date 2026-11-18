extends "../command.gd"

const GodotMcpParams := preload("../params.gd")
const GodotMcpUserPaths := preload("../../files/user_paths.gd")

const DEFAULT_MAX_BYTES := 8000
const MAXIMUM_ENTRIES := 200
const NUL_BYTE := 0


func execute(params: Dictionary) -> Variant:
	var requested: Variant = GodotMcpParams.text(params, "path", GodotMcpUserPaths.ROOT)
	var max_bytes: Variant = GodotMcpParams.whole_number(params, "max_bytes", DEFAULT_MAX_BYTES)
	for value in [requested, max_bytes]:
		if value is GodotMcpCommandError:
			return value
	var path: Variant = GodotMcpUserPaths.normalized(requested)
	if path is GodotMcpCommandError:
		return path
	if DirAccess.dir_exists_absolute(path):
		return _folder(path)
	if FileAccess.file_exists(path):
		return _file(path, max_bytes)
	return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s does not exist" % path, "List what the game has saved with user_data_get without a path.")


func _folder(path: String) -> Dictionary:
	var entries: Array = []
	var more := _collect(path, entries)
	return {"kind": "folder", "folder": OS.get_user_data_dir(), "path": path, "entries": entries, "more": more}


func _collect(folder: String, entries: Array) -> bool:
	for file_name in DirAccess.get_files_at(folder):
		if entries.size() >= MAXIMUM_ENTRIES:
			return true
		var file_path := folder.path_join(file_name)
		entries.append({"path": file_path, "size": FileAccess.get_file_as_bytes(file_path).size(), "modified": _modified(file_path)})
	for subfolder in DirAccess.get_directories_at(folder):
		if _collect(folder.path_join(subfolder), entries):
			return true
	return false


func _file(path: String, max_bytes: int) -> Dictionary:
	var bytes := FileAccess.get_file_as_bytes(path)
	var result := {"kind": "file", "folder": OS.get_user_data_dir(), "path": path, "size": bytes.size(), "modified": _modified(path)}
	if bytes.has(NUL_BYTE):
		result["binary"] = true
		return result
	result["text"] = bytes.slice(0, max_bytes).get_string_from_utf8()
	result["truncated"] = bytes.size() > max_bytes
	return result


static func _modified(path: String) -> String:
	return Time.get_datetime_string_from_unix_time(FileAccess.get_modified_time(path)) + "Z"
