extends RefCounted

const DecodeOutcome := preload("../decode_outcome.gd")
const SimilarNames := preload("../../util/similar_names.gd")
const ValueDecoder := preload("../value_decoder.gd")

const SYNTAX_EXAMPLES := {
	TYPE_VECTOR2: "Vector2(1, 2)",
	TYPE_VECTOR3: "Vector3(1, 2, 3)",
	TYPE_COLOR: "Color(1, 0.5, 0, 1)",
	TYPE_RECT2: "Rect2(0, 0, 64, 32)",
	TYPE_QUATERNION: "Quaternion(0, 0, 0, 1)",
	TYPE_BASIS: "Basis(1, 0, 0, 0, 1, 0, 0, 0, 1)",
	TYPE_TRANSFORM2D: "Transform2D(1, 0, 0, 1, 10, 20)",
	TYPE_TRANSFORM3D: "Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0)",
	TYPE_AABB: "AABB(0, 0, 0, 1, 1, 1)",
	TYPE_PLANE: "Plane(0, 1, 0, 0)",
}
const OBJECT_SYNTAX_MARKERS := ["Object(", "Resource(", "SubResource(", "ExtResource("]


func handles(_property: Dictionary) -> bool:
	return false


func decode(_value: Variant, _property: Dictionary, _target: Object, _decoder: ValueDecoder) -> DecodeOutcome:
	return _failure("this converter does not decode values")


func _success(decoded_value: Variant) -> DecodeOutcome:
	return DecodeOutcome.new(true, decoded_value)


func _failure(message: String) -> DecodeOutcome:
	return DecodeOutcome.new(false, null, message)


func _decode_godot_syntax(text: String, expected_type: int) -> DecodeOutcome:
	var expectation := "expected %s in Godot syntax, such as %s" % [type_string(expected_type), _syntax_example(expected_type)]
	for marker in OBJECT_SYNTAX_MARKERS:
		if text.contains(marker):
			return _failure(expectation)
	var parsed: Variant = str_to_var(text)
	if typeof(parsed) != expected_type:
		return _failure(expectation)
	return _success(parsed)


static func _syntax_example(type: int) -> String:
	return SYNTAX_EXAMPLES.get(type, "%s(…)" % type_string(type))


static func _is_number(value: Variant) -> bool:
	return value is int or value is float


static func _is_whole_number(value: Variant) -> bool:
	if value is int:
		return true
	return value is float and is_finite(value) and value == floorf(value)


static func _is_instance_of(object: Object, type_name: String) -> bool:
	if object.is_class(type_name):
		return true
	var script := object.get_script() as Script
	while script != null:
		if script.get_global_name() == type_name:
			return true
		script = script.get_base_script()
	return false


static func _display_class(object: Object) -> String:
	var script := object.get_script() as Script
	if script != null and not script.get_global_name().is_empty():
		return script.get_global_name()
	return object.get_class()


static func _similar_names(name: String, candidates: Array) -> PackedStringArray:
	return SimilarNames.find(name, candidates)
