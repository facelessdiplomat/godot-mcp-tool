extends "converter.gd"

const EnumOptions := preload("../enum_options.gd")


func handles(property: Dictionary) -> bool:
	return property.get("type") == TYPE_INT and property.get("hint") == PROPERTY_HINT_ENUM


func decode(value: Variant, property: Dictionary, target: Object, _decoder: ValueDecoder) -> DecodeOutcome:
	var options := EnumOptions.parse(property.get("hint_string", ""))
	var option_list := ", ".join(PackedStringArray(options.map(func(option: Dictionary) -> String: return option["name"])))
	if _is_whole_number(value):
		return _success(int(value))
	if not value is String:
		return _failure("expected one of: %s" % option_list)
	var wanted := _normalize(value)
	for option in options:
		if _normalize(option["name"]) == wanted:
			return _success(option["value"])
	var constant_value: Variant = _find_enum_constant(value, str(property.get("name", "")), target)
	if constant_value != null:
		return _success(constant_value)
	return _failure("unknown option \"%s\"; expected one of: %s" % [value, option_list])


static func _normalize(text: String) -> String:
	return text.to_lower().replace(" ", "").replace("-", "").replace("_", "")


static func _find_enum_constant(constant_text: String, property_name: String, target: Object) -> Variant:
	if target == null or property_name.is_empty():
		return null
	var enum_reference := _enum_reference(target.get_class(), property_name)
	if enum_reference.get_slice_count(".") != 2:
		return null
	var enum_owner := enum_reference.get_slice(".", 0)
	var enum_name := enum_reference.get_slice(".", 1)
	var wanted := constant_text.get_slice(".", constant_text.get_slice_count(".") - 1).to_upper()
	for constant_name in ClassDB.class_get_enum_constants(enum_owner, enum_name):
		if constant_name == wanted:
			return ClassDB.class_get_integer_constant(enum_owner, constant_name)
	return null


static func _enum_reference(owner_class: String, property_name: String) -> String:
	var setter := ClassDB.class_get_property_setter(owner_class, property_name)
	if setter.is_empty():
		return ""
	for method in ClassDB.class_get_method_list(owner_class):
		var arguments: Array = method["args"]
		if method["name"] == setter and not arguments.is_empty():
			return str((arguments[-1] as Dictionary).get("class_name", ""))
	return ""
