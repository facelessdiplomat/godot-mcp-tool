extends "converter.gd"

const PACKED_ELEMENT_TYPES := {
	TYPE_PACKED_BYTE_ARRAY: TYPE_INT,
	TYPE_PACKED_INT32_ARRAY: TYPE_INT,
	TYPE_PACKED_INT64_ARRAY: TYPE_INT,
	TYPE_PACKED_FLOAT32_ARRAY: TYPE_FLOAT,
	TYPE_PACKED_FLOAT64_ARRAY: TYPE_FLOAT,
	TYPE_PACKED_STRING_ARRAY: TYPE_STRING,
	TYPE_PACKED_VECTOR2_ARRAY: TYPE_VECTOR2,
	TYPE_PACKED_VECTOR3_ARRAY: TYPE_VECTOR3,
	TYPE_PACKED_COLOR_ARRAY: TYPE_COLOR,
	TYPE_PACKED_VECTOR4_ARRAY: TYPE_VECTOR4,
}


func handles(property: Dictionary) -> bool:
	return property.get("type") == TYPE_ARRAY or PACKED_ELEMENT_TYPES.has(property.get("type"))


func decode(value: Variant, property: Dictionary, target: Object, decoder: ValueDecoder) -> DecodeOutcome:
	if not value is Array:
		return _failure("expected a JSON array")
	var element_property := _element_property(property)
	var elements: Array = []
	for element_index in (value as Array).size():
		var element := decoder.decode(value[element_index], element_property, target)
		if not element.is_success:
			return _failure("[%d]: %s" % [element_index, element.error])
		elements.append(element.value)
	var type: int = property["type"]
	if type != TYPE_ARRAY:
		return _success(type_convert(elements, type))
	return _success(_typed_array(elements, element_property))


static func _element_property(property: Dictionary) -> Dictionary:
	var type: int = property["type"]
	if PACKED_ELEMENT_TYPES.has(type):
		return _property_of(PACKED_ELEMENT_TYPES[type], PROPERTY_HINT_NONE, "")
	if property.get("hint") != PROPERTY_HINT_TYPE_STRING:
		return _property_of(TYPE_NIL, PROPERTY_HINT_NONE, "")
	var description := str(property.get("hint_string", ""))
	var type_part := description.get_slice(":", 0)
	var element_hint_string := description.substr(type_part.length() + 1)
	var element_hint := PROPERTY_HINT_NONE
	if type_part.contains("/"):
		element_hint = type_part.get_slice("/", 1).to_int()
	return _property_of(type_part.get_slice("/", 0).to_int(), element_hint, element_hint_string)


static func _property_of(type: int, hint: int, hint_string: String) -> Dictionary:
	return {"name": "", "type": type, "hint": hint, "hint_string": hint_string, "usage": PROPERTY_USAGE_DEFAULT, "class_name": &""}


static func _typed_array(elements: Array, element_property: Dictionary) -> Array:
	var element_type: int = element_property["type"]
	if element_type == TYPE_NIL:
		return elements
	if element_type != TYPE_OBJECT:
		return Array(elements, element_type, &"", null)
	var class_name_text := str(element_property.get("hint_string", "Object"))
	if ClassDB.class_exists(class_name_text):
		return Array(elements, TYPE_OBJECT, StringName(class_name_text), null)
	for global_class in ProjectSettings.get_global_class_list():
		if global_class["class"] == class_name_text:
			var script := load(global_class["path"]) as Script
			return Array(elements, TYPE_OBJECT, script.get_instance_base_type(), script)
	return elements
