extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const Params := preload("../params.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var save_all: Variant = Params.flag(params, "all", false)
	var scene_path: Variant = Params.text(params, "scene")
	for value in [save_all, scene_path]:
		if value is CommandError:
			return value
	var access := _context.scenes.access
	var scene_root: Node = null
	if not save_all:
		var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
		if resolved is CommandError:
			return resolved
		scene_root = resolved as Node
		if scene_root.scene_file_path.is_empty():
			return CommandError.new(JsonRpc.INVALID_PARAMS, "This scene has no file yet", "Create scenes with scene_create, which gives them a path.")
	var written_scripts: Variant = await _context.scripts.prepare_for_saving()
	if written_scripts is CommandError:
		return written_scripts
	if save_all:
		var save_all_error := access.save_all_scenes()
		if save_all_error != OK:
			return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not save the open scenes: %s" % error_string(save_all_error))
		var saved_paths: Array = []
		for root in access.open_scene_roots():
			saved_paths.append(root.scene_file_path)
		return {"saved": saved_paths, "scripts": written_scripts}
	var save_error := access.save_scene(scene_root)
	if save_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not save %s: %s" % [scene_root.scene_file_path, error_string(save_error)])
	return {"saved": [scene_root.scene_file_path], "scripts": written_scripts}
