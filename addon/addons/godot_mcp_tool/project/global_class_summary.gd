extends RefCounted

const ADDONS_FOLDER := "res://addons/"


static func summarize(global_classes: Array[Dictionary], maximum_project_classes: int) -> Dictionary:
	var project_classes: Array = []
	var class_counts_by_addon_folder: Dictionary[String, int] = {}
	for global_class in global_classes:
		var path := str(global_class["path"])
		if path.begins_with(ADDONS_FOLDER):
			var addon_folder := path.trim_prefix(ADDONS_FOLDER).get_slice("/", 0)
			class_counts_by_addon_folder[addon_folder] = class_counts_by_addon_folder.get(addon_folder, 0) + 1
		else:
			project_classes.append({"name": str(global_class["class"]), "base": str(global_class["base"]), "path": path})
	return {
		"project": project_classes.slice(0, maximum_project_classes),
		"project_count": project_classes.size(),
		"addons": _in_folder_order(class_counts_by_addon_folder),
	}


static func _in_folder_order(class_counts_by_addon_folder: Dictionary[String, int]) -> Array:
	var addon_folders: Array[String] = class_counts_by_addon_folder.keys()
	addon_folders.sort_custom(func(left: String, right: String) -> bool: return left.naturalnocasecmp_to(right) < 0)
	return addon_folders.map(func(addon_folder: String) -> Dictionary: return {"folder": addon_folder, "count": class_counts_by_addon_folder[addon_folder]})
