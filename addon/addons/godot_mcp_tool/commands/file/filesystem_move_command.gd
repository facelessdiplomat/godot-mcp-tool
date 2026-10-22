extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const FileSystemAccess := preload("../../editor/file_system_access.gd")
const FileUsages := preload("../../files/file_usages.gd")
const Params := preload("../params.gd")
const ProjectFileIndex := preload("../../files/project_file_index.gd")
const ProjectPaths := preload("../../files/project_paths.gd")
const ReferenceRewriter := preload("../../files/reference_rewriter.gd")
const ResourcePaths := preload("../../util/resource_paths.gd")
const Waiting := preload("../../util/waiting.gd")

const SCAN_TIMEOUT_MSEC := 60_000
const SINGLETON_MARK := "*"

var _context: EditingContext
var _file_system: FileSystemAccess
var _save_settings: Callable


func _init(context: EditingContext, file_system: FileSystemAccess, save_settings: Callable) -> void:
	_context = context
	_file_system = file_system
	_save_settings = save_settings


func execute(params: Dictionary) -> Variant:
	var from: Variant = Params.required_text(params, "from", "\"res://materials/ice.tres\"")
	var to: Variant = Params.required_text(params, "to", "\"res://surfaces/ice.tres\"")
	for value in [from, to]:
		if value is CommandError:
			return value
	var source: Variant = ProjectPaths.existing(from)
	if source is CommandError:
		return source
	var is_folder := (source as String).ends_with("/")
	var destination: Variant = _free_destination(source, (to as String).trim_suffix("/"))
	if destination is CommandError:
		return destination
	if is_folder:
		destination = ProjectPaths.folder(destination)
		if (destination as String).begins_with(source):
			return CommandError.new(JsonRpc.INVALID_PARAMS, "A folder cannot move into itself", "Choose a destination outside %s." % source)
	var renames := _renames(source, destination, is_folder)
	var usages := FileUsages.find(PackedStringArray(renames.keys()), FileUsages.PROJECT_PREFIX, FileUsages.CodeMentions.BY_PATH)
	var unsaved := _unsaved_scenes_to_change(renames, usages)
	if not unsaved.is_empty():
		return CommandError.new(
			JsonRpc.CONFLICT,
			"Moving %s changes scenes with unsaved changes: %s" % [source, ", ".join(unsaved)],
			"Save them with scene_save, or close them with scene_close, and move again.",
		)
	var move_error := _move_on_disk(source, destination, is_folder)
	if move_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "%s could not be moved to %s: %s" % [source, destination, error_string(move_error)])
	_update_cached_resources(renames)
	_file_system.update_files(_old_and_new_paths(renames))
	var rewritten := _rewrite_users(usages["used_by"], renames)
	_follow_open_scenes(renames, rewritten["updated"])
	var settings := _update_settings(usages["settings"], renames)
	var applied_before := _file_system.applied_scans()
	_file_system.scan()
	await Waiting.until(func() -> bool: return _file_system.applied_scans() != applied_before, SCAN_TIMEOUT_MSEC)
	return {
		"from": source,
		"to": destination,
		"moved": renames.size(),
		"updated": rewritten["updated"],
		"not_updated": rewritten["not_updated"],
		"settings": settings,
		"code": _at_new_paths(usages["code"], renames),
	}


static func _free_destination(source: String, destination: String) -> Variant:
	if _is_case_only_rename(source.trim_suffix("/"), destination):
		var location_error := ProjectPaths.location_error(destination)
		return destination if location_error == null else location_error
	return ProjectPaths.free_location(destination)


static func _is_case_only_rename(source: String, destination: String) -> bool:
	if source == destination or source.to_lower() != destination.to_lower():
		return false
	var parent := DirAccess.open(source.get_base_dir())
	return parent != null and not parent.is_case_sensitive(source.get_base_dir())


static func _renames(source: String, destination: String, is_folder: bool) -> Dictionary:
	if not is_folder:
		return {source: destination}
	var renames := {}
	for file_path in ProjectFileIndex.files_under(source):
		renames[file_path] = destination + file_path.trim_prefix(source)
	return renames


func _unsaved_scenes_to_change(renames: Dictionary, usages: Dictionary) -> Array:
	var changed_paths: Array = renames.keys() + (usages["used_by"] as Array).map(func(user: Dictionary) -> String: return user["path"])
	var unsaved: Array = []
	for root in _context.scenes.access.open_scene_roots():
		if root.scene_file_path in changed_paths and _context.scenes.access.is_scene_unsaved(root):
			unsaved.append(root.scene_file_path)
	return unsaved


static func _move_on_disk(source: String, destination: String, is_folder: bool) -> Error:
	var destination_path := destination.trim_suffix("/")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(destination_path.get_base_dir()))
	var companions := PackedStringArray() if is_folder else ProjectFileIndex.companions_of(source)
	var move_error := DirAccess.rename_absolute(ProjectSettings.globalize_path(source.trim_suffix("/")), ProjectSettings.globalize_path(destination_path))
	if move_error != OK:
		return move_error
	for companion in companions:
		DirAccess.rename_absolute(ProjectSettings.globalize_path(companion), ProjectSettings.globalize_path(destination_path + "." + companion.get_extension()))
	return OK


static func _update_cached_resources(renames: Dictionary) -> void:
	for old_path in renames:
		if ResourceLoader.has_cached(old_path):
			ResourceLoader.get_cached_ref(old_path).take_over_path(renames[old_path])


static func _at_new_paths(mentions: Array, renames: Dictionary) -> Array:
	return mentions.map(func(mention: Dictionary) -> Dictionary: return mention.merged({"path": renames.get(mention["path"], mention["path"])}, true))


static func _old_and_new_paths(renames: Dictionary) -> PackedStringArray:
	var paths := PackedStringArray()
	for old_path in renames:
		paths.append_array([old_path, renames[old_path]])
	return paths


static func _rewrite_users(users: Array, renames: Dictionary) -> Dictionary:
	var updated: Array = []
	var not_updated: Array = []
	for user in users:
		var location: String = renames.get(user["path"], user["path"])
		if not ReferenceRewriter.can_rewrite(location):
			not_updated.append({"path": location, "reason": "a binary file, which only the editor can rewrite; open it and save it again"})
			continue
		var rewrite_error := ReferenceRewriter.rewrite(location, renames)
		if rewrite_error == OK:
			updated.append(location)
		elif rewrite_error != ERR_SKIP:
			not_updated.append({"path": location, "reason": error_string(rewrite_error)})
	return {"updated": updated, "not_updated": not_updated}


func _follow_open_scenes(renames: Dictionary, updated: Array) -> void:
	for root in _context.scenes.access.open_scene_roots():
		if renames.has(root.scene_file_path):
			root.scene_file_path = renames[root.scene_file_path]
	for scene_path in updated:
		if _context.scenes.access.open_scene_roots().any(func(root: Node) -> bool: return root.scene_file_path == scene_path):
			_context.scenes.access.reload_scene(scene_path)


func _update_settings(mentions: Array, renames: Dictionary) -> Array:
	var updated: Array = []
	for mention in mentions:
		var value: String = mention["value"]
		var is_singleton := value.begins_with(SINGLETON_MARK)
		var old_path := value.trim_prefix(SINGLETON_MARK)
		if not renames.has(old_path):
			continue
		var new_value: String = (SINGLETON_MARK if is_singleton else "") + str(renames[old_path])
		ProjectSettings.set_setting(mention["name"], new_value)
		updated.append({"name": mention["name"], "value": new_value})
	if not updated.is_empty():
		_save_settings.call()
	return updated
