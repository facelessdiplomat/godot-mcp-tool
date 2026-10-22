extends "converter.gd"


func handles(property: Dictionary) -> bool:
	return property.get("type", TYPE_NIL) == TYPE_NIL


func decode(value: Variant, _property: Dictionary, _target: Object, _decoder: ValueDecoder) -> DecodeOutcome:
	if value is float and _is_whole_number(value):
		return _success(int(value))
	return _success(value)
