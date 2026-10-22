extends "../command.gd"

const AutoloadList := preload("../../project/autoload_list.gd")
const ResourcePaths := preload("../../util/resource_paths.gd")

const MAXIMUM_GLOBAL_CLASSES := 100
const ADDONS_FOLDER := "res://addons/"

var _read_indentation: Callable


func _init(read_indentation: Callable) -> void:
	_read_indentation = read_indentation


func execute(_params: Dictionary) -> Variant:
	var global_classes := ProjectSettings.get_global_class_list()
	return {
		"name": str(ProjectSettings.get_setting("application/config/name", "")),
		"path": ProjectSettings.globalize_path("res://").trim_suffix("/"),
		"main_scene": ResourcePaths.resolve(str(ProjectSettings.get_setting("application/run/main_scene", ""))),
		"features": Array(ProjectSettings.get_setting("application/config/features", PackedStringArray())),
		"renderer": str(ProjectSettings.get_setting("rendering/renderer/rendering_method", "")),
		"physics_engine_3d": str(ProjectSettings.get_setting("physics/3d/physics_engine", "")),
		"window": {
			"width": ProjectSettings.get_setting("display/window/size/viewport_width", 0),
			"height": ProjectSettings.get_setting("display/window/size/viewport_height", 0),
			"stretch_mode": str(ProjectSettings.get_setting("display/window/stretch/mode", "")),
			"stretch_aspect": str(ProjectSettings.get_setting("display/window/stretch/aspect", "")),
		},
		"autoloads": AutoloadList.read(),
		"enabled_plugins": Array(ProjectSettings.get_setting("editor_plugins/enabled", PackedStringArray())),
		"global_classes": _describe_global_classes(global_classes),
		"global_class_count": global_classes.size(),
		"indentation": _read_indentation.call(),
		"folders": _top_level_folders(),
	}


static func _describe_global_classes(global_classes: Array[Dictionary]) -> Array:
	var described: Array = []
	for global_class in _project_classes_first(global_classes).slice(0, MAXIMUM_GLOBAL_CLASSES):
		described.append({"name": str(global_class["class"]), "base": str(global_class["base"]), "path": str(global_class["path"])})
	return described


static func _project_classes_first(global_classes: Array[Dictionary]) -> Array[Dictionary]:
	var project_classes := global_classes.filter(func(global_class: Dictionary) -> bool: return not _is_in_addons(global_class))
	var addon_classes := global_classes.filter(_is_in_addons)
	return project_classes + addon_classes


static func _is_in_addons(global_class: Dictionary) -> bool:
	return str(global_class["path"]).begins_with(ADDONS_FOLDER)


static func _top_level_folders() -> Array:
	var folders: Array = []
	for folder in DirAccess.get_directories_at("res://"):
		if not folder.begins_with("."):
			folders.append(folder)
	return folders
