extends RefCounted

const UndoHistory := preload("undo_history.gd")

var _do_steps: Array[Dictionary] = []
var _undo_steps: Array[Dictionary] = []
var _do_references: Array[Object] = []
var _undo_references: Array[Object] = []


func add_do_call(target: Object, method: StringName, arguments: Array = []) -> void:
	_do_steps.append({"target": target, "method": method, "arguments": arguments})


func add_undo_call(target: Object, method: StringName, arguments: Array = []) -> void:
	_undo_steps.append({"target": target, "method": method, "arguments": arguments})


func add_do_property(target: Object, property: StringName, value: Variant) -> void:
	_do_steps.append({"target": target, "property": property, "value": value})


func add_undo_property(target: Object, property: StringName, value: Variant) -> void:
	_undo_steps.append({"target": target, "property": property, "value": value})


func add_do_reference(object: Object) -> void:
	_do_references.append(object)


func add_undo_reference(object: Object) -> void:
	_undo_references.append(object)


func is_empty() -> bool:
	return _do_steps.is_empty() and _undo_steps.is_empty()


func apply() -> void:
	_run(_do_steps)


func revert() -> void:
	_run(_undo_steps)


func release_created() -> void:
	for object in _do_references:
		if is_instance_valid(object) and object is Node and (object as Node).get_parent() == null:
			object.free()


func write_do_steps(history: UndoHistory) -> void:
	for step in _do_steps:
		if step.has("method"):
			history.add_do_call(step["target"], step["method"], step["arguments"])
		else:
			history.add_do_property(step["target"], step["property"], step["value"])
	for object in _do_references:
		history.add_do_reference(object)


func write_undo_steps(history: UndoHistory) -> void:
	for step in _undo_steps:
		if step.has("method"):
			history.add_undo_call(step["target"], step["method"], step["arguments"])
		else:
			history.add_undo_property(step["target"], step["property"], step["value"])
	for object in _undo_references:
		history.add_undo_reference(object)


static func _run(steps: Array[Dictionary]) -> void:
	for step in steps:
		var target: Object = step["target"]
		if step.has("method"):
			target.callv(step["method"], step["arguments"])
		else:
			target.set(step["property"], step["value"])
