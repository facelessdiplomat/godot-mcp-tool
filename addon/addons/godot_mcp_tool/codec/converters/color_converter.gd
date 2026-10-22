extends "converter.gd"

const UNKNOWN_COLOR := Color(-1, -1, -1, -1)
const EXPECTATION := "use a name such as \"red\", a hex code such as \"#ff8800\", [r, g, b, a] or {\"r\", \"g\", \"b\", \"a\"} with values from 0 to 1"


func handles(property: Dictionary) -> bool:
	return property.get("type") == TYPE_COLOR


func decode(value: Variant, _property: Dictionary, _target: Object, _decoder: ValueDecoder) -> DecodeOutcome:
	if value is String:
		return _decode_text(value)
	var channels := _channels_of(value)
	if channels.is_empty():
		return _failure("expected a color: %s" % EXPECTATION)
	return _success(Color(channels[0], channels[1], channels[2], channels[3]))


func _decode_text(text: String) -> DecodeOutcome:
	if text.begins_with("Color("):
		return _decode_godot_syntax(text, TYPE_COLOR)
	var parsed := Color.from_string(text, UNKNOWN_COLOR)
	if parsed == UNKNOWN_COLOR:
		return _failure("unknown color \"%s\"; %s" % [text, EXPECTATION])
	return _success(parsed)


static func _channels_of(value: Variant) -> Array:
	var channels: Array = []
	if value is Array and (value as Array).size() in [3, 4]:
		channels = (value as Array).duplicate()
	elif value is Dictionary and (value as Dictionary).has_all(["r", "g", "b"]):
		channels = [value["r"], value["g"], value["b"], (value as Dictionary).get("a", 1.0)]
	if channels.size() == 3:
		channels.append(1.0)
	for channel in channels:
		if not _is_number(channel):
			return []
	return channels
