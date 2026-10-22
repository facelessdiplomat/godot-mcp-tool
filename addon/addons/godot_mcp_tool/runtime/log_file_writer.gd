extends RefCounted

const ARGUMENT_PREFIX := "--mcp-log-file="

var _file: FileAccess


func _init(path: String) -> void:
	_file = FileAccess.open(path, FileAccess.WRITE)


static func path_from_arguments(user_arguments: PackedStringArray) -> String:
	for argument in user_arguments:
		if argument.begins_with(ARGUMENT_PREFIX):
			return argument.trim_prefix(ARGUMENT_PREFIX)
	return ""


func send_entries(entries: Array) -> void:
	for entry in entries:
		_write({"type": "log", "entry": entry})


func send_ready(scene_path: String) -> void:
	_write({"type": "ready", "scene": scene_path})


func close() -> void:
	if _file != null:
		_file.close()
		_file = null


func _write(record: Dictionary) -> void:
	if _file == null:
		return
	_file.store_line(JSON.stringify(record))
	_file.flush()
