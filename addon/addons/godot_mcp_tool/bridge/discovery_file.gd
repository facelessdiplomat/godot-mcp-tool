extends RefCounted

const BridgeProbe := preload("bridge_probe.gd")

const OWNER_ONLY_PERMISSIONS := FileAccess.UNIX_READ_OWNER | FileAccess.UNIX_WRITE_OWNER
const NO_OWNER := -1

var path: String


func _init(file_path: String) -> void:
	path = file_path


func claim(record: Dictionary) -> Error:
	if _is_served_by_another_editor(read(), record):
		return ERR_ALREADY_IN_USE
	return write(record)


func release(own_pid: int) -> void:
	var record := read()
	if int(record.get("pid", NO_OWNER)) != own_pid:
		return
	var closed_record := {"closed": true}
	if record.has("executable_path"):
		closed_record["executable_path"] = record["executable_path"]
	write(closed_record)


func owner_pid() -> int:
	return int(read().get("pid", NO_OWNER))


func read() -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var record: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if record is Dictionary:
		return record
	return {}


func write(record: Dictionary) -> Error:
	var directory_error := DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	if directory_error != OK:
		return directory_error
	var temporary_path := path + ".tmp"
	var file := FileAccess.open(temporary_path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(record, "  "))
	file.close()
	if OS.get_name() != "Windows":
		FileAccess.set_unix_permissions(temporary_path, OWNER_ONLY_PERMISSIONS)
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)
	return DirAccess.rename_absolute(temporary_path, path)


func _is_served_by_another_editor(current: Dictionary, record: Dictionary) -> bool:
	if not current.has("port"):
		return false
	var current_port := int(current["port"])
	if int(current.get("pid", NO_OWNER)) == int(record.get("pid", NO_OWNER)) or current_port == int(record.get("port", 0)):
		return false
	return BridgeProbe.is_listening(current_port)
