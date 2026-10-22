extends RefCounted


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


func commit() -> void:
	pass
