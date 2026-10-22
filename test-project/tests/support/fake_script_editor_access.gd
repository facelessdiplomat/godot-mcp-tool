extends "res://addons/godot_mcp_tool/editor/script_editor_access.gd"

var unsaved := PackedStringArray()
var open_scripts := PackedStringArray()
var changed_outside := PackedStringArray()
var reload_count := 0


func unsaved_files() -> PackedStringArray:
	return unsaved


func open_script_paths() -> PackedStringArray:
	return open_scripts


func reload_open_files() -> void:
	reload_count += 1


func files_changed_outside() -> PackedStringArray:
	return changed_outside
