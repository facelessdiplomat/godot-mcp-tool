extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const Params := preload("../params.gd")
const SceneResolver := preload("../../scene/scene_resolver.gd")

const SAVE_CHANGES := "save"
const DISCARD_CHANGES := "discard"

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = Params.text(params, "scene")
	var unsaved_choice: Variant = Params.text(params, "unsaved")
	for value in [scene_path, unsaved_choice]:
		if value is CommandError:
			return value
	if not unsaved_choice in ["", SAVE_CHANGES, DISCARD_CHANGES]:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"unsaved\" must be \"%s\" or \"%s\"" % [SAVE_CHANGES, DISCARD_CHANGES])
	var found: Variant = _open_scene_root(scene_path)
	if found is CommandError:
		return found
	var scene_root := found as Node
	var access := _context.scenes.access
	var closed_path := scene_root.scene_file_path
	var has_unsaved_changes := access.is_scene_unsaved(scene_root)
	if has_unsaved_changes and unsaved_choice == "":
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s has unsaved changes" % closed_path, "Pass unsaved: \"%s\" to save them first, or \"%s\" to close the scene without them." % [SAVE_CHANGES, DISCARD_CHANGES])
	var saved := false
	if has_unsaved_changes and unsaved_choice == SAVE_CHANGES:
		var save_error := access.save_scene(scene_root)
		if save_error != OK:
			return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not save %s, so it stays open: %s" % [closed_path, error_string(save_error)])
		saved = true
	var close_error := access.close_scene(scene_root)
	if close_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not close %s: %s" % [closed_path, error_string(close_error)])
	var current_root := access.edited_scene_root()
	return {
		"closed": closed_path,
		"saved": saved,
		"discarded_changes": has_unsaved_changes and unsaved_choice == DISCARD_CHANGES,
		"current": current_root.scene_file_path if current_root != null else "",
	}


func _open_scene_root(requested_scene: String) -> Variant:
	var access := _context.scenes.access
	if requested_scene.is_empty():
		var edited_root := access.edited_scene_root()
		return edited_root if edited_root != null else SceneResolver.no_scene_error()
	var scene_path: Variant = SceneResolver.with_main_scene(requested_scene)
	if scene_path is CommandError:
		return scene_path
	var path_error := SceneResolver.validate_scene_path(scene_path)
	if path_error != null:
		return path_error
	var open_root := _context.scenes.find_open_root(scene_path)
	if open_root != null:
		return open_root
	var open_paths := PackedStringArray()
	for root in access.open_scene_roots():
		open_paths.append(root.scene_file_path)
	var hint := "Open scenes: %s." % ", ".join(open_paths) if not open_paths.is_empty() else "No scene is open."
	return CommandError.new(JsonRpc.NOT_FOUND, "%s is not open in the editor" % scene_path, hint)
