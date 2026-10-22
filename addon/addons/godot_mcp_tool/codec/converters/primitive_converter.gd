extends "converter.gd"

const HANDLED_TYPES := [TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_STRING_NAME, TYPE_NODE_PATH]


func handles(property: Dictionary) -> bool:
	return property.get("type") in HANDLED_TYPES


func decode(value: Variant, property: Dictionary, _target: Object, _decoder: ValueDecoder) -> DecodeOutcome:
	match property["type"]:
		TYPE_BOOL:
			return _success(value) if value is bool else _failure("expected a boolean (true or false)")
		TYPE_INT:
			return _success(int(value)) if _is_whole_number(value) else _failure("expected a whole number")
		TYPE_FLOAT:
			return _success(float(value)) if _is_number(value) else _failure("expected a number")
		TYPE_STRING:
			return _success(value) if value is String else _failure("expected text")
		TYPE_STRING_NAME:
			return _success(StringName(value)) if value is String or value is StringName else _failure("expected text")
		_:
			if value is String or value is NodePath:
				return _success(NodePath(value))
			return _failure("expected a node path such as \"Player/Mesh\"")
