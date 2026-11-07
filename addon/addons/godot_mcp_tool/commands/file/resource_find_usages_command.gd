extends "../command.gd"

const GodotMcpFileUsages := preload("../../files/file_usages.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpProjectPaths := preload("../../files/project_paths.gd")


func execute(params: Dictionary) -> Variant:
	var path: Variant = GodotMcpParams.required_text(params, "path", "\"res://materials/ice.tres\"")
	if path is GodotMcpCommandError:
		return path
	var target: Variant = GodotMcpProjectPaths.existing(path)
	if target is GodotMcpCommandError:
		return target
	var targets := PackedStringArray([target])
	var usages := GodotMcpFileUsages.outside(GodotMcpFileUsages.find(targets), targets)
	return {"path": target, "uid": _uid_of(target), "used_by": usages["used_by"], "settings": usages["settings"], "code": usages["code"]}


static func _uid_of(path: String) -> String:
	if path.ends_with("/"):
		return ""
	var uid := ResourceLoader.get_resource_uid(path)
	return ResourceUID.id_to_text(uid) if uid != ResourceUID.INVALID_ID else ""
