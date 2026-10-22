extends "../command.gd"

const MAXIMUM_GLOBAL_CLASSES := 100

var _read_indentation: Callable


func _init(read_indentation: Callable) -> void:
	_read_indentation = read_indentation


func execute(_params: Dictionary) -> Variant:
	var global_classes := ProjectSettings.get_global_class_list()
	return {
		"name": str(ProjectSettings.get_setting("application/config/name", "")),
		"path": ProjectSettings.globalize_path("res://").trim_suffix("/"),
		"main_scene": _as_path(str(ProjectSettings.get_setting("application/run/main_scene", ""))),
		"features": Array(ProjectSettings.get_setting("application/config/features", PackedStringArray())),
		"renderer": str(ProjectSettings.get_setting("rendering/renderer/rendering_method", "")),
		"physics_engine_3d": str(ProjectSettings.get_setting("physics/3d/physics_engine", "")),
		"window": {
			"width": ProjectSettings.get_setting("display/window/size/viewport_width", 0),
			"height": ProjectSettings.get_setting("display/window/size/viewport_height", 0),
			"stretch_mode": str(ProjectSettings.get_setting("display/window/stretch/mode", "")),
			"stretch_aspect": str(ProjectSettings.get_setting("display/window/stretch/aspect", "")),
		},
		"autoloads": _autoloads(),
		"enabled_plugins": Array(ProjectSettings.get_setting("editor_plugins/enabled", PackedStringArray())),
		"global_classes": _describe_global_classes(global_classes),
		"global_class_count": global_classes.size(),
		"indentation": _read_indentation.call(),
		"folders": _top_level_folders(),
	}


static func _as_path(path_or_uid: String) -> String:
	if not path_or_uid.begins_with("uid://"):
		return path_or_uid
	var uid := ResourceUID.text_to_id(path_or_uid)
	return ResourceUID.get_id_path(uid) if ResourceUID.has_id(uid) else path_or_uid


static func _autoloads() -> Array:
	var autoloads: Array = []
	for property in ProjectSettings.get_property_list():
		var setting_name := str(property["name"])
		if not setting_name.begins_with("autoload/"):
			continue
		var value := str(ProjectSettings.get_setting(setting_name))
		autoloads.append({
			"name": setting_name.trim_prefix("autoload/"),
			"path": _as_path(value.trim_prefix("*")),
			"singleton": value.begins_with("*"),
		})
	return autoloads


static func _describe_global_classes(global_classes: Array[Dictionary]) -> Array:
	var described: Array = []
	for global_class in global_classes.slice(0, MAXIMUM_GLOBAL_CLASSES):
		described.append({"name": str(global_class["class"]), "base": str(global_class["base"]), "path": str(global_class["path"])})
	return described


static func _top_level_folders() -> Array:
	var folders: Array = []
	for folder in DirAccess.get_directories_at("res://"):
		if not folder.begins_with("."):
			folders.append(folder)
	return folders
