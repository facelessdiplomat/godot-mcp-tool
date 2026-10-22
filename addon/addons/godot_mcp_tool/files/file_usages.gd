extends RefCounted

const ProjectFileIndex := preload("project_file_index.gd")
const ResourceFiles := preload("../resources/resource_files.gd")
const ResourcePaths := preload("../util/resource_paths.gd")

const RESOURCE_EXTENSIONS := ["tscn", "scn", "tres", "res"]
const CODE_EXTENSIONS := ["gd", "gdshader", "gdshaderinc"]
const SINGLETON_MARK := "*"
const PROJECT_PREFIX := "res://"
const ADDONS_FOLDER := "addons/"
const MAXIMUM_LINE_LENGTH := 160

enum CodeMentions { BY_PATH, BY_PATH_OR_UID }


static func find(targets: PackedStringArray, root := PROJECT_PREFIX, code_mentions := CodeMentions.BY_PATH_OR_UID) -> Dictionary:
	var names_in_code := targets if code_mentions == CodeMentions.BY_PATH else _with_uids(targets)
	var addons_folder := root.path_join(ADDONS_FOLDER)
	var searches_addon_code := Array(targets).any(func(target: String) -> bool: return target.begins_with(addons_folder))
	var used_by: Array = []
	var code: Array = []
	for file_path in ProjectFileIndex.files_under(root):
		var extension := file_path.get_extension().to_lower()
		if extension in RESOURCE_EXTENSIONS:
			var uses: Array = ResourceFiles.dependencies_of(file_path).filter(func(dependency: String) -> bool: return is_targeted(dependency, targets))
			if not uses.is_empty():
				used_by.append({"path": file_path, "uses": uses})
		elif extension in CODE_EXTENSIONS and (searches_addon_code or not file_path.begins_with(addons_folder)):
			code.append_array(_code_mentions(file_path, names_in_code))
	return {"used_by": used_by, "settings": _setting_mentions(targets), "code": code}


static func outside(usages: Dictionary, targets: PackedStringArray) -> Dictionary:
	var is_outside := func(usage: Dictionary) -> bool: return not is_targeted(usage["path"], targets)
	return {
		"used_by": (usages["used_by"] as Array).filter(is_outside),
		"settings": usages["settings"],
		"code": (usages["code"] as Array).filter(is_outside),
	}


static func is_targeted(file_path: String, targets: PackedStringArray) -> bool:
	for target in targets:
		if file_path == target or (target.ends_with("/") and file_path.begins_with(target)):
			return true
	return false


static func _with_uids(targets: PackedStringArray) -> PackedStringArray:
	var names := targets.duplicate()
	for target in targets:
		var file_paths := ProjectFileIndex.files_under(target) if target.ends_with("/") else PackedStringArray([target])
		for file_path in file_paths:
			var uid := ResourceLoader.get_resource_uid(file_path)
			if uid != ResourceUID.INVALID_ID:
				names.append(ResourceUID.id_to_text(uid))
	return names


static func _code_mentions(file_path: String, names: PackedStringArray) -> Array:
	var mentions: Array = []
	var lines := FileAccess.get_file_as_string(file_path).split("\n")
	for index in lines.size():
		for name in names:
			if lines[index].contains(name):
				mentions.append({"path": file_path, "line": index + 1, "text": lines[index].strip_edges().left(MAXIMUM_LINE_LENGTH)})
				break
	return mentions


static func _setting_mentions(targets: PackedStringArray) -> Array:
	var mentions: Array = []
	for property in ProjectSettings.get_property_list():
		var name := str(property["name"])
		if not ProjectSettings.has_setting(name):
			continue
		var value: Variant = ProjectSettings.get_setting(name)
		if not value is String:
			continue
		var referenced := ResourcePaths.resolve((value as String).trim_prefix(SINGLETON_MARK))
		if referenced.begins_with(PROJECT_PREFIX) and is_targeted(referenced, targets):
			mentions.append({"name": name, "value": value})
	return mentions
