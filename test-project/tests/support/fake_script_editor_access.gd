extends "res://addons/godot_mcp_tool/editor/script_editor_access.gd"

var unsaved := PackedStringArray()
var open_scripts := PackedStringArray()
var changed_outside := PackedStringArray()
var reload_count := 0
var changed_closed_scripts := PackedStringArray()
var closed_script_reloads := 0
var breakpoint_lines := PackedStringArray()
var while_reloading := Callable()
var script_place := {}


func unsaved_files() -> PackedStringArray:
	return unsaved


func open_script_paths() -> PackedStringArray:
	return open_scripts


func reload_open_files() -> void:
	reload_count += 1
	if while_reloading.is_valid():
		while_reloading.call()


func reload_changed_closed_scripts() -> PackedStringArray:
	closed_script_reloads += 1
	return changed_closed_scripts


func files_changed_outside() -> PackedStringArray:
	return changed_outside


func breakpoints() -> PackedStringArray:
	return breakpoint_lines


func current_script_place() -> Dictionary:
	return script_place
