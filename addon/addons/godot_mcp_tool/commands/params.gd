extends RefCounted

const CommandError := preload("command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")


static func text(params: Dictionary, key: String, default_value: String = "") -> Variant:
	var value: Variant = params.get(key, default_value)
	if value == null:
		return default_value
	if not value is String:
		return _invalid(key, "text")
	return (value as String).strip_edges()


static func required_text(params: Dictionary, key: String, example: String) -> Variant:
	var value: Variant = params.get(key)
	if not value is String or (value as String).strip_edges().is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" is required" % key, "Example: %s" % example)
	return (value as String).strip_edges()


static func whole_number(params: Dictionary, key: String, default_value: int) -> Variant:
	var value: Variant = params.get(key, default_value)
	if value == null:
		return default_value
	if value is int:
		return value
	if value is float and is_finite(value) and value == floorf(value):
		return int(value)
	return _invalid(key, "a whole number")


static func flag(params: Dictionary, key: String, default_value: bool) -> Variant:
	var value: Variant = params.get(key, default_value)
	if value == null:
		return default_value
	if not value is bool:
		return _invalid(key, "true or false")
	return value


static func dictionary(params: Dictionary, key: String) -> Variant:
	var value: Variant = params.get(key, {})
	if value == null:
		return {}
	if not value is Dictionary:
		return _invalid(key, "an object")
	return value


static func text_list(params: Dictionary, key: String) -> Variant:
	var value: Variant = params.get(key, [])
	if value == null:
		return []
	if not value is Array:
		return _invalid(key, "a list of texts")
	for item in value:
		if not item is String:
			return _invalid(key, "a list of texts")
	return value


static func _invalid(key: String, expected: String) -> CommandError:
	return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" must be %s" % [key, expected])
