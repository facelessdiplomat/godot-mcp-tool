extends "autoload_registry.gd"

const AUTOLOAD_PREFIX := "autoload/"
const AUTOLOAD_SETTINGS_CLASS := "EditorAutoloadSettings"

var _plugin: EditorPlugin


func _init(plugin: EditorPlugin) -> void:
	_plugin = plugin


func add(autoload_name: String, path: String) -> void:
	_plugin.add_autoload_singleton(autoload_name, path)


func remove(autoload_name: String) -> void:
	_plugin.remove_autoload_singleton(autoload_name)
	ProjectSettings.set_setting(AUTOLOAD_PREFIX + autoload_name, null)
	for autoload_settings in EditorInterface.get_base_control().find_children("*", AUTOLOAD_SETTINGS_CLASS, true, false):
		autoload_settings.call(&"update_autoload")
