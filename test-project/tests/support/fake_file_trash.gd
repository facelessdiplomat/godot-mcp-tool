extends "res://addons/godot_mcp_tool/editor/file_trash.gd"

const ScratchFolder := preload("res://tests/support/scratch_folder.gd")

var trashed := PackedStringArray()


func move_to_trash(absolute_path: String) -> Error:
	trashed.append(absolute_path)
	if DirAccess.dir_exists_absolute(absolute_path):
		ScratchFolder.remove(absolute_path)
		return OK
	return DirAccess.remove_absolute(absolute_path)
