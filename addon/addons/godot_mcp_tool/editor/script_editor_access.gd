extends RefCounted


func unsaved_files() -> PackedStringArray:
	return PackedStringArray()


func open_script_paths() -> PackedStringArray:
	return PackedStringArray()


func reload_open_files() -> void:
	pass


func files_changed_outside() -> PackedStringArray:
	return PackedStringArray()
