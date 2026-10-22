extends "../command.gd"

const FileUsages := preload("../../files/file_usages.gd")
const Params := preload("../params.gd")
const ProjectPaths := preload("../../files/project_paths.gd")


func execute(params: Dictionary) -> Variant:
	var path: Variant = Params.required_text(params, "path", "\"res://materials/ice.tres\"")
	if path is CommandError:
		return path
	var target: Variant = ProjectPaths.existing(path)
	if target is CommandError:
		return target
	var targets := PackedStringArray([target])
	var usages := FileUsages.outside(FileUsages.find(targets), targets)
	return {"path": target, "uid": _uid_of(target), "used_by": usages["used_by"], "settings": usages["settings"], "code": usages["code"]}


static func _uid_of(path: String) -> String:
	if path.ends_with("/"):
		return ""
	var uid := ResourceLoader.get_resource_uid(path)
	return ResourceUID.id_to_text(uid) if uid != ResourceUID.INVALID_ID else ""
