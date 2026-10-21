extends RefCounted

const OWNER_ONLY_PERMISSIONS := FileAccess.UNIX_READ_OWNER | FileAccess.UNIX_WRITE_OWNER

var path: String


func _init(file_path: String) -> void:
	path = file_path


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


func remove() -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)
