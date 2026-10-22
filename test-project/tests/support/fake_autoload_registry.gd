extends "res://addons/godot_mcp_tool/editor/autoload_registry.gd"

const AUTOLOAD_PREFIX := "autoload/"

var added: Array[Dictionary] = []
var removed := PackedStringArray()


func add(autoload_name: String, path: String) -> void:
	added.append({"name": autoload_name, "path": path})
	ProjectSettings.set_setting(AUTOLOAD_PREFIX + autoload_name, "*" + path)


func remove(autoload_name: String) -> void:
	removed.append(autoload_name)
	ProjectSettings.set_setting(AUTOLOAD_PREFIX + autoload_name, null)


func forget(autoload_name: String) -> void:
	if ProjectSettings.has_setting(AUTOLOAD_PREFIX + autoload_name):
		ProjectSettings.set_setting(AUTOLOAD_PREFIX + autoload_name, null)
