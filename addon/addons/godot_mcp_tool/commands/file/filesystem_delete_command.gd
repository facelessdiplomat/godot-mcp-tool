extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const FileSystemAccess := preload("../../editor/file_system_access.gd")
const FileTrash := preload("../../editor/file_trash.gd")
const FileUsages := preload("../../files/file_usages.gd")
const Params := preload("../params.gd")
const ProjectFileIndex := preload("../../files/project_file_index.gd")
const ProjectPaths := preload("../../files/project_paths.gd")
const Waiting := preload("../../util/waiting.gd")

const SCAN_TIMEOUT_MSEC := 60_000
const AUTOLOAD_PREFIX := "autoload/"

var _context: EditingContext
var _file_system: FileSystemAccess
var _trash: FileTrash
var _save_settings: Callable


func _init(context: EditingContext, file_system: FileSystemAccess, trash: FileTrash, save_settings: Callable) -> void:
	_context = context
	_file_system = file_system
	_trash = trash
	_save_settings = save_settings


func execute(params: Dictionary) -> Variant:
	var paths: Variant = Params.text_list(params, "paths")
	var force: Variant = Params.flag(params, "force", false)
	for value in [paths, force]:
		if value is CommandError:
			return value
	if (paths as Array).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"paths\" needs at least one file or folder", "Example: {\"paths\": [\"res://materials/old_ice.tres\"]}")
	var targets := PackedStringArray()
	for path in paths:
		var target: Variant = ProjectPaths.existing(path)
		if target is CommandError:
			return target
		if not target in targets:
			targets.append(target)
	var usages := FileUsages.outside(FileUsages.find(targets), targets)
	var autoloads: Array = (usages["settings"] as Array).filter(func(setting: Dictionary) -> bool: return str(setting["name"]).begins_with(AUTOLOAD_PREFIX))
	if not autoloads.is_empty():
		var names := ", ".join(PackedStringArray(autoloads.map(func(setting: Dictionary) -> String: return str(setting["name"]).trim_prefix(AUTOLOAD_PREFIX))))
		return CommandError.new(JsonRpc.CONFLICT, "Deleting these files would break the autoload %s" % names, "Remove the autoload first with autoload_remove, then delete the files.")
	var is_used := ["used_by", "settings", "code"].any(func(kind: String) -> bool: return not (usages[kind] as Array).is_empty())
	if is_used and not force:
		return {"deleted": [], "blocked": true, "failed": [], "used_by": usages["used_by"], "settings": usages["settings"], "code": usages["code"]}
	var open_problem := _close_open_scenes(targets)
	if open_problem != null:
		return open_problem
	var cleared := _clear_settings(usages["settings"])
	var deleted: Array = []
	var failed: Array = []
	for target in targets:
		_forget_cached_resources(target)
		var trash_error := _move_to_trash(target)
		if trash_error == OK:
			deleted.append(target)
		else:
			failed.append({"path": target, "reason": error_string(trash_error)})
	var applied_before := _file_system.applied_scans()
	_file_system.scan()
	await Waiting.until(func() -> bool: return _file_system.applied_scans() != applied_before, SCAN_TIMEOUT_MSEC)
	return {"deleted": deleted, "blocked": false, "failed": failed, "used_by": usages["used_by"], "settings": cleared, "code": usages["code"]}


func _close_open_scenes(targets: PackedStringArray) -> CommandError:
	var to_close: Array[Node] = []
	for root in _context.scenes.access.open_scene_roots():
		if FileUsages.is_targeted(root.scene_file_path, targets):
			if _context.scenes.access.is_scene_unsaved(root):
				return CommandError.new(
					JsonRpc.CONFLICT,
					"%s is open in the editor with unsaved changes" % root.scene_file_path,
					"Save it with scene_save or discard the changes with scene_close, then delete it.",
				)
			to_close.append(root)
	for root in to_close:
		_context.scenes.access.close_scene(root)
	return null


func _clear_settings(mentions: Array) -> Array:
	var cleared: Array = []
	for mention in mentions:
		ProjectSettings.set_setting(mention["name"], "")
		cleared.append({"name": mention["name"], "value": ""})
	if not cleared.is_empty():
		_save_settings.call()
	return cleared


static func _forget_cached_resources(target: String) -> void:
	var file_paths := ProjectFileIndex.files_under(target) if target.ends_with("/") else PackedStringArray([target])
	for file_path in file_paths:
		if ResourceLoader.has_cached(file_path):
			ResourceLoader.get_cached_ref(file_path).resource_path = ""


func _move_to_trash(target: String) -> Error:
	if target.ends_with("/"):
		return _trash.move_to_trash(ProjectSettings.globalize_path(target.trim_suffix("/")))
	var companions := ProjectFileIndex.companions_of(target)
	var trash_error := _trash.move_to_trash(ProjectSettings.globalize_path(target))
	if trash_error != OK:
		return trash_error
	for companion in companions:
		_trash.move_to_trash(ProjectSettings.globalize_path(companion))
	return OK
