extends "undo_history.gd"

var _manager: EditorUndoRedoManager


func _init(manager: EditorUndoRedoManager) -> void:
	_manager = manager


func begin(action_name: String, context: Object) -> void:
	_manager.create_action(action_name, UndoRedo.MERGE_DISABLE, context)


func add_do_call(target: Object, method: StringName, arguments: Array = []) -> void:
	_manager.callv(&"add_do_method", [target, method] + arguments)


func add_undo_call(target: Object, method: StringName, arguments: Array = []) -> void:
	_manager.callv(&"add_undo_method", [target, method] + arguments)


func add_do_property(target: Object, property: StringName, value: Variant) -> void:
	_manager.add_do_property(target, property, value)


func add_undo_property(target: Object, property: StringName, value: Variant) -> void:
	_manager.add_undo_property(target, property, value)


func add_do_reference(object: Object) -> void:
	_manager.add_do_reference(object)


func add_undo_reference(object: Object) -> void:
	_manager.add_undo_reference(object)


func commit(execute: bool = true) -> void:
	_manager.commit_action(execute)


func undo_in(context: Object) -> bool:
	var undone := _scene_history(context).undo()
	if undone:
		_manager.version_changed.emit()
	return undone


func redo_in(context: Object) -> bool:
	var redone := _scene_history(context).redo()
	if redone:
		_manager.version_changed.emit()
	return redone


func next_undo_name(context: Object) -> String:
	var history := _scene_history(context)
	return history.get_current_action_name() if history.has_undo() else ""


func next_redo_name(context: Object) -> String:
	var history := _scene_history(context)
	return history.get_action_name(history.get_current_action() + 1) if history.has_redo() else ""


func _scene_history(context: Object) -> UndoRedo:
	return _manager.get_history_undo_redo(_manager.get_object_history_id(context))
