extends "converter.gd"

const COMPONENT_NAMES := {
	TYPE_VECTOR2: ["x", "y"],
	TYPE_VECTOR2I: ["x", "y"],
	TYPE_VECTOR3: ["x", "y", "z"],
	TYPE_VECTOR3I: ["x", "y", "z"],
	TYPE_VECTOR4: ["x", "y", "z", "w"],
	TYPE_VECTOR4I: ["x", "y", "z", "w"],
	TYPE_QUATERNION: ["x", "y", "z", "w"],
}
const WHOLE_NUMBER_TYPES := [TYPE_VECTOR2I, TYPE_VECTOR3I, TYPE_VECTOR4I]


func handles(property: Dictionary) -> bool:
	return COMPONENT_NAMES.has(property.get("type"))


func decode(value: Variant, property: Dictionary, _target: Object, _decoder: ValueDecoder) -> DecodeOutcome:
	var type: int = property["type"]
	if value is String:
		return _decode_godot_syntax(value, type)
	var component_names: Array = COMPONENT_NAMES[type]
	var components := _components_of(value, component_names)
	if components.size() != component_names.size():
		return _failure(_expectation(type, component_names))
	for component in components:
		if not _is_number(component):
			return _failure(_expectation(type, component_names))
		if type in WHOLE_NUMBER_TYPES and not _is_whole_number(component):
			return _failure("%s needs whole numbers" % type_string(type))
	return _success(_construct(type, components))


static func _components_of(value: Variant, component_names: Array) -> Array:
	if value is Array:
		return value
	if value is Dictionary:
		var components: Array = []
		for component_name in component_names:
			if not (value as Dictionary).has(component_name):
				return []
			components.append(value[component_name])
		return components
	return []


static func _expectation(type: int, component_names: Array) -> String:
	var joined := ", ".join(PackedStringArray(component_names))
	return "expected %d numbers for %s: [%s], {%s} or %s" % [component_names.size(), type_string(type), joined, joined, _syntax_example(type)]


static func _construct(type: int, components: Array) -> Variant:
	match type:
		TYPE_VECTOR2:
			return Vector2(components[0], components[1])
		TYPE_VECTOR2I:
			return Vector2i(int(components[0]), int(components[1]))
		TYPE_VECTOR3:
			return Vector3(components[0], components[1], components[2])
		TYPE_VECTOR3I:
			return Vector3i(int(components[0]), int(components[1]), int(components[2]))
		TYPE_VECTOR4:
			return Vector4(components[0], components[1], components[2], components[3])
		TYPE_VECTOR4I:
			return Vector4i(int(components[0]), int(components[1]), int(components[2]), int(components[3]))
		_:
			return Quaternion(components[0], components[1], components[2], components[3])
