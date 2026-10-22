extends RefCounted

const ChangeSet := preload("change_set.gd")


func record(action_name: String, context: Object, change_sets: Array, execute: bool = true) -> void:
	begin(action_name, context)
	for change_set: ChangeSet in change_sets:
		change_set.write_do_steps(self)
	for index in range(change_sets.size() - 1, -1, -1):
		(change_sets[index] as ChangeSet).write_undo_steps(self)
	commit(execute)


func begin(_action_name: String, _context: Object) -> void:
	pass


func add_do_call(_target: Object, _method: StringName, _arguments: Array = []) -> void:
	pass


func add_undo_call(_target: Object, _method: StringName, _arguments: Array = []) -> void:
	pass


func add_do_property(_target: Object, _property: StringName, _value: Variant) -> void:
	pass


func add_undo_property(_target: Object, _property: StringName, _value: Variant) -> void:
	pass


func add_do_reference(_object: Object) -> void:
	pass


func add_undo_reference(_object: Object) -> void:
	pass


func commit(_execute: bool = true) -> void:
	pass
