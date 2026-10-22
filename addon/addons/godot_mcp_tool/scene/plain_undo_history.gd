extends "undo_history.gd"

var _undo_redo := UndoRedo.new()


func begin(action_name: String, _context: Object) -> void:
	_undo_redo.create_action(action_name)


func add_do_call(target: Object, method: StringName, arguments: Array = []) -> void:
	_undo_redo.add_do_method(Callable(target, method).bindv(arguments))


func add_undo_call(target: Object, method: StringName, arguments: Array = []) -> void:
	_undo_redo.add_undo_method(Callable(target, method).bindv(arguments))


func add_do_property(target: Object, property: StringName, value: Variant) -> void:
	_undo_redo.add_do_property(target, property, value)


func add_undo_property(target: Object, property: StringName, value: Variant) -> void:
	_undo_redo.add_undo_property(target, property, value)


func add_do_reference(object: Object) -> void:
	_undo_redo.add_do_reference(object)


func add_undo_reference(object: Object) -> void:
	_undo_redo.add_undo_reference(object)


func commit(execute: bool = true) -> void:
	_undo_redo.commit_action(execute)


func undo() -> bool:
	return _undo_redo.undo()


func redo() -> bool:
	return _undo_redo.redo()


func last_action_name() -> String:
	return _undo_redo.get_current_action_name()


func dispose() -> void:
	_undo_redo.free()
