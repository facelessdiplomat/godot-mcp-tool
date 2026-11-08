extends "res://addons/godot_mcp_tool/editor/extension_access.gd"

var rebuilt := PackedStringArray()
var reload_requests := 0


func request_reload() -> void:
	reload_requests += 1


func take_reloaded() -> PackedStringArray:
	var reloaded := rebuilt
	rebuilt = PackedStringArray()
	return reloaded
