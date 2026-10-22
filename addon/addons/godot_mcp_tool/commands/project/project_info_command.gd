extends "../command.gd"

const AutoloadList := preload("../../project/autoload_list.gd")
const GlobalClassSummary := preload("../../project/global_class_summary.gd")
const ResourcePaths := preload("../../util/resource_paths.gd")

const MAXIMUM_PROJECT_CLASSES := 50

var _read_indentation: Callable


func _init(read_indentation: Callable) -> void:
	_read_indentation = read_indentation


func execute(_params: Dictionary) -> Variant:
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
		"global_classes": GlobalClassSummary.summarize(ProjectSettings.get_global_class_list(), MAXIMUM_PROJECT_CLASSES),
		"indentation": _read_indentation.call(),
		"folders": _top_level_folders(),
	}


static func _top_level_folders() -> Array:
	var folders: Array = []
	for folder in DirAccess.get_directories_at("res://"):
		if not folder.begins_with("."):
			folders.append(folder)
	return folders
