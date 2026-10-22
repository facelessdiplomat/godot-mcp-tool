extends "converter.gd"

const UNTYPED_PROPERTY := {"name": "", "type": TYPE_NIL, "hint": PROPERTY_HINT_NONE, "hint_string": "", "usage": PROPERTY_USAGE_DEFAULT, "class_name": &""}


func handles(property: Dictionary) -> bool:
	return property.get("type") == TYPE_DICTIONARY


func decode(value: Variant, _property: Dictionary, target: Object, decoder: ValueDecoder) -> DecodeOutcome:
	if not value is Dictionary:
		return _failure("expected a JSON object")
	var decoded := {}
	for key in value:
		var element := decoder.decode(value[key], UNTYPED_PROPERTY, target)
		if not element.is_success:
			return _failure("[%s]: %s" % [str(key), element.error])
		decoded[key] = element.value
	return _success(decoded)
