extends "plugin_access.gd"


func is_enabled(name: String) -> bool:
	return EditorInterface.is_plugin_enabled(name)


func set_enabled(name: String, enabled: bool) -> void:
	EditorInterface.set_plugin_enabled(name, enabled)
