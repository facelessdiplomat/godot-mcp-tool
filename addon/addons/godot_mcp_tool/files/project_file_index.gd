extends RefCounted

const COMPANION_EXTENSIONS := ["import", "uid"]
const HIDDEN_PREFIX := "."


static func files_under(folder: String) -> PackedStringArray:
	var files := PackedStringArray()
	_collect(folder, files)
	files.sort()
	return files


static func companions_of(file_path: String) -> PackedStringArray:
	var companions := PackedStringArray()
	for extension in COMPANION_EXTENSIONS:
		if FileAccess.file_exists("%s.%s" % [file_path, extension]):
			companions.append("%s.%s" % [file_path, extension])
	return companions


static func _collect(folder: String, files: PackedStringArray) -> void:
	for file_name in DirAccess.get_files_at(folder):
		if not file_name.get_extension().to_lower() in COMPANION_EXTENSIONS:
			files.append(folder.path_join(file_name))
	for directory_name in DirAccess.get_directories_at(folder):
		if not directory_name.begins_with(HIDDEN_PREFIX):
			_collect(folder.path_join(directory_name), files)
