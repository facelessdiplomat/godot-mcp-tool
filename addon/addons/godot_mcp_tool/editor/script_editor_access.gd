extends RefCounted


func unsaved_files() -> PackedStringArray:
	return PackedStringArray()


func open_script_paths() -> PackedStringArray:
	return PackedStringArray()


func reload_open_files() -> void:
	pass


func reload_changed_closed_scripts() -> PackedStringArray:
	return PackedStringArray()


func files_changed_outside() -> PackedStringArray:
	return PackedStringArray()


func breakpoints() -> PackedStringArray:
	return PackedStringArray()


func current_script_place() -> Dictionary:
	return {}
