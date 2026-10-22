extends "converter.gd"

const HANDLED_TYPES := [
	TYPE_RECT2,
	TYPE_RECT2I,
	TYPE_PLANE,
	TYPE_AABB,
	TYPE_BASIS,
	TYPE_TRANSFORM2D,
	TYPE_TRANSFORM3D,
	TYPE_PROJECTION,
]


func handles(property: Dictionary) -> bool:
	return property.get("type") in HANDLED_TYPES


func decode(value: Variant, property: Dictionary, _target: Object, _decoder: ValueDecoder) -> DecodeOutcome:
	var type: int = property["type"]
	if value is String:
		return _decode_godot_syntax(value, type)
	return _failure("expected %s in Godot syntax, such as %s" % [type_string(type), _syntax_example(type)])
