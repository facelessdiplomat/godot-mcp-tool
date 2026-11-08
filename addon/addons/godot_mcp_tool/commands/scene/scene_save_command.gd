extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpParams := preload("../params.gd")

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var save_all: Variant = GodotMcpParams.flag(params, "all", false)
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	for value in [save_all, scene_path]:
		if value is GodotMcpCommandError:
			return value
	var access := _context.scenes.access
	var saved_scene_path := ""
	if not save_all:
		var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
		if resolved is GodotMcpCommandError:
			return resolved
		saved_scene_path = (resolved as Node).scene_file_path
		if saved_scene_path.is_empty():
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "This scene has no file yet", "Create scenes with scene_create, which gives them a path.")
	var written_scripts: Variant = await _context.scripts.prepare_for_saving()
	if written_scripts is GodotMcpCommandError:
		return written_scripts
	if save_all:
		var save_all_error := access.save_all_scenes()
		if save_all_error != OK:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not save the open scenes: %s" % error_string(save_all_error))
		var saved_paths: Array = []
		for root in access.open_scene_roots():
			saved_paths.append(root.scene_file_path)
		return {"saved": saved_paths, "scripts": written_scripts}
	var scene_root := _context.scenes.find_open_root(saved_scene_path)
	if scene_root == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s was closed before it could be saved" % saved_scene_path, "Open it with scene_open and save it again.")
	var save_error := access.save_scene(scene_root)
	if save_error != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not save %s: %s" % [saved_scene_path, error_string(save_error)])
	return {"saved": [saved_scene_path], "scripts": written_scripts}
