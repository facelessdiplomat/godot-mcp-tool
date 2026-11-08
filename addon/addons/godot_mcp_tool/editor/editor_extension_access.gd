extends "extension_access.gd"

var _reloaded_extensions: Array[GDExtension] = []
var _remember_reloaded := Callable.create(_reloaded_extensions, "append")


func request_reload() -> void:
	if not GDExtensionManager.extension_loaded.is_connected(_remember_reloaded):
		GDExtensionManager.extension_loaded.connect(_remember_reloaded)
	var sleep_usec := OS.low_processor_usage_mode_sleep_usec
	EditorInterface.get_base_control().get_parent().notification(Node.NOTIFICATION_APPLICATION_FOCUS_IN)
	OS.low_processor_usage_mode_sleep_usec = sleep_usec


func take_reloaded() -> PackedStringArray:
	if GDExtensionManager.extension_loaded.is_connected(_remember_reloaded):
		GDExtensionManager.extension_loaded.disconnect(_remember_reloaded)
	var paths := PackedStringArray()
	for extension in _reloaded_extensions:
		paths.append(extension.resource_path)
	_reloaded_extensions.clear()
	return paths
