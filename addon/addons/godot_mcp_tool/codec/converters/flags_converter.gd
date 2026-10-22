extends "converter.gd"

const LAYER_HINTS := [
	PROPERTY_HINT_LAYERS_2D_RENDER,
	PROPERTY_HINT_LAYERS_2D_PHYSICS,
	PROPERTY_HINT_LAYERS_2D_NAVIGATION,
	PROPERTY_HINT_LAYERS_3D_RENDER,
	PROPERTY_HINT_LAYERS_3D_PHYSICS,
	PROPERTY_HINT_LAYERS_3D_NAVIGATION,
	PROPERTY_HINT_LAYERS_AVOIDANCE,
]
const HIGHEST_LAYER := 32


func handles(property: Dictionary) -> bool:
	if property.get("type") != TYPE_INT:
		return false
	return property.get("hint") == PROPERTY_HINT_FLAGS or property.get("hint") in LAYER_HINTS


func decode(value: Variant, property: Dictionary, _target: Object, _decoder: ValueDecoder) -> DecodeOutcome:
	if _is_whole_number(value):
		return _success(int(value))
	if not value is Array:
		return _failure("expected a whole number bit mask or a list of flag names or layer numbers")
	if property["hint"] == PROPERTY_HINT_FLAGS:
		return _decode_flag_names(value, property.get("hint_string", ""))
	return _decode_layer_numbers(value)


func _decode_flag_names(flag_names: Array, hint_string: String) -> DecodeOutcome:
	var flags := _parse_flags(hint_string)
	var mask := 0
	for flag_name in flag_names:
		if not flag_name is String or not flags.has(flag_name):
			return _failure("unknown flag \"%s\"; expected some of: %s" % [str(flag_name), ", ".join(PackedStringArray(flags.keys()))])
		mask |= int(flags[flag_name])
	return _success(mask)


func _decode_layer_numbers(layers: Array) -> DecodeOutcome:
	var mask := 0
	for layer in layers:
		if not _is_whole_number(layer) or int(layer) < 1 or int(layer) > HIGHEST_LAYER:
			return _failure("layer numbers must be whole numbers from 1 to %d" % HIGHEST_LAYER)
		mask |= 1 << (int(layer) - 1)
	return _success(mask)


static func _parse_flags(hint_string: String) -> Dictionary:
	var flags := {}
	var next_bit := 1
	for entry in hint_string.split(",", false):
		var parts := entry.split(":")
		var bit_value := next_bit
		if parts.size() > 1 and parts[1].strip_edges().is_valid_int():
			bit_value = parts[1].strip_edges().to_int()
		flags[parts[0].strip_edges()] = bit_value
		next_bit = bit_value * 2
	return flags
