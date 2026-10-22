extends "command.gd"

const EditingContext := preload("../scene/editing_context.gd")
const Params := preload("params.gd")
const SceneEdit := preload("../scene/edits/scene_edit.gd")

var _context: EditingContext
var _edit_script: Script


func _init(context: EditingContext, edit_script: Script) -> void:
	_context = context
	_edit_script = edit_script


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = Params.text(params, "scene")
	if scene_path is CommandError:
		return scene_path
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is CommandError:
		return resolved
	var scene_root := resolved as Node
	var edit: SceneEdit = _edit_script.new(_context)
	var problem := edit.prepare(scene_root, params)
	if problem != null:
		edit.changes.release_created()
		return problem
	if not edit.changes.is_empty():
		_context.history.record(edit.action_name, scene_root, [edit.changes])
	var result := {"scene": scene_root.scene_file_path}
	result.merge(edit.finish())
	return result
