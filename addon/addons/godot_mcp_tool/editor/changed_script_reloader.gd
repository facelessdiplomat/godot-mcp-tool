extends RefCounted

const SCRIPT_EXTENSION := "gd"
const ADDONS_FOLDER := "res://addons"


static func reload_changed(script_paths: PackedStringArray, open_script_paths: PackedStringArray) -> PackedStringArray:
	var reloaded := PackedStringArray()
	for path in script_paths:
		if path in open_script_paths or not ResourceLoader.has_cached(path):
			continue
		var script := ResourceLoader.load(path) as Script
		if script == null:
			continue
		var on_disk := FileAccess.get_file_as_string(path)
		if on_disk.is_empty() and FileAccess.get_open_error() != OK:
			continue
		if script.source_code == on_disk:
			continue
		script.source_code = on_disk
		script.reload(true)
		reloaded.append(path)
	return reloaded


static func project_scripts(directory: String) -> PackedStringArray:
	var found := PackedStringArray()
	if directory == ADDONS_FOLDER:
		return found
	for file_name in DirAccess.get_files_at(directory):
		if file_name.get_extension() == SCRIPT_EXTENSION:
			found.append(directory.path_join(file_name))
	for folder in DirAccess.get_directories_at(directory):
		if not folder.begins_with("."):
			found.append_array(project_scripts(directory.path_join(folder)))
	return found
