extends "converter.gd"

const GodotMcpLayerNames := preload("../layer_names.gd")

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


func decode(value: Variant, property: Dictionary, _target: Object, _decoder: GodotMcpValueDecoder) -> GodotMcpDecodeOutcome:
	if _is_whole_number(value):
		return _success(int(value))
	if not value is Array:
		return _failure("expected a whole number bit mask or a list of flag names, or of layer numbers and names")
	if property["hint"] == PROPERTY_HINT_FLAGS:
		return _decode_flag_names(value, property.get("hint_string", ""))
	return _decode_layers(value, GodotMcpLayerNames.kind_of(property["hint"]))


func _decode_flag_names(flag_names: Array, hint_string: String) -> GodotMcpDecodeOutcome:
	var flags := _parse_flags(hint_string)
	var mask := 0
	for flag_name in flag_names:
		if not flag_name is String or not flags.has(flag_name):
			return _failure("unknown flag \"%s\"; expected some of: %s" % [str(flag_name), ", ".join(PackedStringArray(flags.keys()))])
		mask |= int(flags[flag_name])
	return _success(mask)


func _decode_layers(layers: Array, kind: String) -> GodotMcpDecodeOutcome:
	var mask := 0
	for layer in layers:
		var number: Variant = _layer_number(layer, kind)
		if number is String:
			return _failure(number)
		mask |= 1 << (int(number) - 1)
	return _success(mask)


static func _layer_number(layer: Variant, kind: String) -> Variant:
	if layer is String or layer is StringName:
		return _layer_number_named(str(layer), kind)
	if not _is_whole_number(layer) or int(layer) < 1 or int(layer) > HIGHEST_LAYER:
		return "layer numbers must be whole numbers from 1 to %d, and layer names must be text" % HIGHEST_LAYER
	return int(layer)


static func _layer_number_named(layer_name: String, kind: String) -> Variant:
	var title := GodotMcpLayerNames.title_of(kind)
	var numbers := GodotMcpLayerNames.numbers_named(kind, layer_name)
	if numbers.size() == 1:
		return numbers[0]
	if numbers.size() > 1:
		return "the %s layers %s are both named \"%s\"; give the layer number instead" % [title, " and ".join(PackedStringArray(numbers.map(func(number: int) -> String: return str(number)))), layer_name]
	var named := GodotMcpLayerNames.named_layers(kind)
	if named.is_empty():
		return "no %s layer is named \"%s\", and none has a name yet; name one with project_settings_set, such as {\"%s%s/layer_2\": \"%s\"}, or give layer numbers" % [title, layer_name, GodotMcpLayerNames.SETTING_PREFIX, kind, layer_name]
	return "no %s layer is named \"%s\"; the named %s layers are %s" % [title, layer_name, title, GodotMcpLayerNames.describe_layers(named)]


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
