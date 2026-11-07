extends "command.gd"

const GodotMcpEditingContext := preload("../scene/editing_context.gd")
const GodotMcpParams := preload("params.gd")
const GodotMcpSceneEdit := preload("../scene/edits/scene_edit.gd")

var _context: GodotMcpEditingContext
var _edit_script: Script


func _init(context: GodotMcpEditingContext, edit_script: Script) -> void:
	_context = context
	_edit_script = edit_script


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	if scene_path is GodotMcpCommandError:
		return scene_path
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	var edit: GodotMcpSceneEdit = _edit_script.new(_context)
	var problem := edit.prepare(scene_root, params)
	if problem != null:
		edit.changes.release_created()
		return problem
	if not edit.changes.is_empty():
		_context.history.record(edit.action_name, scene_root, [edit.changes])
	var result := {"scene": scene_root.scene_file_path}
	result.merge(edit.finish())
	return result
