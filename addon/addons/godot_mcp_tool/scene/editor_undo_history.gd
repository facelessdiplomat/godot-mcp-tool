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


func commit() -> void:
	_manager.commit_action()
