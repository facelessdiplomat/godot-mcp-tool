extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSceneEdit := preload("../../scene/edits/scene_edit.gd")

const OPERATIONS := {
	"node_add": preload("../../scene/edits/node_addition.gd"),
	"node_delete": preload("../../scene/edits/node_deletion.gd"),
	"node_set_properties": preload("../../scene/edits/property_change.gd"),
	"node_reparent": preload("../../scene/edits/node_move.gd"),
	"node_duplicate": preload("../../scene/edits/node_duplication.gd"),
	"node_set_groups": preload("../../scene/edits/group_change.gd"),
	"signal_connect": preload("../../scene/edits/signal_connection.gd"),
	"signal_disconnect": preload("../../scene/edits/signal_disconnection.gd"),
}
const MAXIMUM_OPERATIONS := 100
const OPERATION_EXAMPLE := "{\"op\": \"node_add\", \"type\": \"MeshInstance3D\", \"name\": \"Crate\"}"

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var operations: Variant = params.get("operations")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	if scene_path is GodotMcpCommandError:
		return scene_path
	if not operations is Array or (operations as Array).is_empty() or (operations as Array).size() > MAXIMUM_OPERATIONS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"operations\" needs from 1 to %d operations" % MAXIMUM_OPERATIONS, "Each operation looks like %s." % OPERATION_EXAMPLE)
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	var applied: Array[GodotMcpSceneEdit] = []
	var results: Array = []
	for index in (operations as Array).size():
		var operation: Variant = operations[index]
		var edit: Variant = _edit_for(operation)
		if edit is GodotMcpCommandError:
			return _abandon(index, _operation_name(operation), edit, applied)
		var scene_edit := edit as GodotMcpSceneEdit
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
	_context.history.record("MCP: Edit %s (%d operations)" % [scene_root.name, results.size()], scene_root, applied.map(func(edit: GodotMcpSceneEdit) -> Variant: return edit.changes), false)
	return {"scene": scene_root.scene_file_path, "results": results}


func _edit_for(operation: Variant) -> Variant:
	if not operation is Dictionary:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "an operation is an object", "Example: %s" % OPERATION_EXAMPLE)
	var operation_name := _operation_name(operation)
	if not OPERATIONS.has(operation_name):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "unknown op \"%s\"" % operation_name, "op is one of %s." % ", ".join(PackedStringArray(OPERATIONS.keys())))
	if (operation as Dictionary).has("scene"):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "operations take no \"scene\"", "Pass \"scene\" once for the whole batch.")
	return (OPERATIONS[operation_name] as Script).new(_context)


func _abandon(index: int, operation_name: String, problem: GodotMcpCommandError, applied: Array[GodotMcpSceneEdit]) -> GodotMcpCommandError:
	for position in range(applied.size() - 1, -1, -1):
		applied[position].changes.revert()
	for edit in applied:
		edit.changes.release_created()
	var label := "Operation %d" % (index + 1) if operation_name.is_empty() else "Operation %d (%s)" % [index + 1, operation_name]
	return GodotMcpCommandError.new(problem.code, "%s: %s. Nothing was changed." % [label, problem.message.trim_suffix(".")], problem.hint)


static func _operation_name(operation: Variant) -> String:
	return str((operation as Dictionary).get("op", "")) if operation is Dictionary else ""


static func _incompleteness(result: Dictionary) -> GodotMcpCommandError:
	var rejected: Array = result.get("rejected", [])
	if not rejected.is_empty():
		var first_rejection: Dictionary = rejected[0]
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s was rejected: %s" % [first_rejection["name"], first_rejection["reason"]], "Fix the value or leave the property out.")
	return null
