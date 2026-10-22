extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const Params := preload("../params.gd")
const SceneEdit := preload("../../scene/edits/scene_edit.gd")

const OPERATIONS := {
	"node_add": preload("../../scene/edits/node_addition.gd"),
	"node_delete": preload("../../scene/edits/node_deletion.gd"),
	"node_set_properties": preload("../../scene/edits/property_change.gd"),
	"node_reparent": preload("../../scene/edits/node_move.gd"),
	"node_duplicate": preload("../../scene/edits/node_duplication.gd"),
	"signal_connect": preload("../../scene/edits/signal_connection.gd"),
	"signal_disconnect": preload("../../scene/edits/signal_disconnection.gd"),
}
const MAXIMUM_OPERATIONS := 100
const OPERATION_EXAMPLE := "{\"op\": \"node_add\", \"type\": \"MeshInstance3D\", \"name\": \"Crate\"}"

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var operations: Variant = params.get("operations")
	var scene_path: Variant = Params.text(params, "scene")
	if scene_path is CommandError:
		return scene_path
	if not operations is Array or (operations as Array).is_empty() or (operations as Array).size() > MAXIMUM_OPERATIONS:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"operations\" needs from 1 to %d operations" % MAXIMUM_OPERATIONS, "Each operation looks like %s." % OPERATION_EXAMPLE)
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is CommandError:
		return resolved
	var scene_root := resolved as Node
	var applied: Array[SceneEdit] = []
	var results: Array = []
	for index in (operations as Array).size():
		var operation: Variant = operations[index]
		var edit: Variant = _edit_for(operation)
		if edit is CommandError:
			return _abandon(index, _operation_name(operation), edit, applied)
		var scene_edit := edit as SceneEdit
		var problem := scene_edit.prepare(scene_root, operation)
		if problem != null:
			scene_edit.changes.release_created()
			return _abandon(index, _operation_name(operation), problem, applied)
		scene_edit.changes.apply()
		applied.append(scene_edit)
		var result := scene_edit.finish()
		var incomplete := _incompleteness(result)
		if incomplete != null:
			return _abandon(index, _operation_name(operation), incomplete, applied)
		result["op"] = _operation_name(operation)
		results.append(result)
	_context.history.record("MCP: Edit %s (%d operations)" % [scene_root.name, results.size()], scene_root, applied.map(func(edit: SceneEdit) -> Variant: return edit.changes), false)
	return {"scene": scene_root.scene_file_path, "results": results}


func _edit_for(operation: Variant) -> Variant:
	if not operation is Dictionary:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "an operation is an object", "Example: %s" % OPERATION_EXAMPLE)
	var operation_name := _operation_name(operation)
	if not OPERATIONS.has(operation_name):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "unknown op \"%s\"" % operation_name, "op is one of %s." % ", ".join(PackedStringArray(OPERATIONS.keys())))
	if (operation as Dictionary).has("scene"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "operations take no \"scene\"", "Pass \"scene\" once for the whole batch.")
	return (OPERATIONS[operation_name] as Script).new(_context)


func _abandon(index: int, operation_name: String, problem: CommandError, applied: Array[SceneEdit]) -> CommandError:
	for position in range(applied.size() - 1, -1, -1):
		applied[position].changes.revert()
	for edit in applied:
		edit.changes.release_created()
	var label := "Operation %d" % (index + 1) if operation_name.is_empty() else "Operation %d (%s)" % [index + 1, operation_name]
	return CommandError.new(problem.code, "%s: %s. Nothing was changed." % [label, problem.message.trim_suffix(".")], problem.hint)


static func _operation_name(operation: Variant) -> String:
	return str((operation as Dictionary).get("op", "")) if operation is Dictionary else ""


static func _incompleteness(result: Dictionary) -> CommandError:
	var rejected: Array = result.get("rejected", [])
	if not rejected.is_empty():
		var first_rejection: Dictionary = rejected[0]
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s was rejected: %s" % [first_rejection["name"], first_rejection["reason"]], "Fix the value or leave the property out.")
	var not_applied: Array = result.get("not_applied", [])
	if not not_applied.is_empty():
		var first_mismatch: Dictionary = not_applied[0]
		return CommandError.new(
			JsonRpc.OPERATION_FAILED,
			"%s did not take the value %s; it reads %s" % [first_mismatch["name"], JSON.stringify(first_mismatch["expected"]), JSON.stringify(first_mismatch["actual"])],
			"The engine changed or refused the value; check the allowed range of the property.",
		)
	return null
