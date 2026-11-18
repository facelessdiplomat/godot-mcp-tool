extends RefCounted

const ADDONS_DIRECTORY := "res://addons"
const PLUGIN_FILE := "plugin.cfg"


func names() -> PackedStringArray:
	var found := PackedStringArray()
	for directory in DirAccess.get_directories_at(ADDONS_DIRECTORY):
		if FileAccess.file_exists(ADDONS_DIRECTORY.path_join(directory).path_join(PLUGIN_FILE)):
			found.append(directory)
	return found


func is_enabled(_name: String) -> bool:
	return false


func set_enabled(_name: String, _enabled: bool) -> void:
	pass
