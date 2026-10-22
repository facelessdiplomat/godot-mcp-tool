extends "value_decoder.gd"

const MAXIMUM_ENCODED_ITEMS := 100
const CONVERTER_SCRIPTS := [
	preload("converters/untyped_converter.gd"),
	preload("converters/enum_converter.gd"),
	preload("converters/flags_converter.gd"),
	preload("converters/primitive_converter.gd"),
	preload("converters/vector_converter.gd"),
	preload("converters/color_converter.gd"),
	preload("converters/godot_syntax_converter.gd"),
	preload("converters/resource_converter.gd"),
	preload("converters/node_reference_converter.gd"),
	preload("converters/array_converter.gd"),
	preload("converters/dictionary_converter.gd"),
]

var _converters: Array = []


func _init() -> void:
	for converter_script in CONVERTER_SCRIPTS:
		_converters.append(converter_script.new())


func decode(value: Variant, property: Dictionary, target: Object = null) -> DecodeOutcome:
	for converter in _converters:
		if converter.handles(property):
			return converter.decode(value, property, target, self)
	return DecodeOutcome.new(false, null, "values of type %s cannot be set through the bridge yet" % type_string(property.get("type", TYPE_NIL)))


func encode(value: Variant) -> Variant:
	var type := typeof(value)
	if type in [TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_STRING]:
		return value
	if type == TYPE_FLOAT:
		return _encode_float(value)
	if type == TYPE_STRING_NAME or type == TYPE_NODE_PATH:
		return str(value)
	if type == TYPE_OBJECT:
		return _encode_object(value)
	if type == TYPE_ARRAY:
		return _encode_items(value)
	if type == TYPE_DICTIONARY:
		return _encode_dictionary(value)
	if type >= TYPE_PACKED_BYTE_ARRAY:
		return _encode_items(Array(value))
	return var_to_str(value)


func _encode_float(value: float) -> Variant:
	if is_nan(value):
		return "nan"
	if is_inf(value):
		return "inf" if value > 0 else "-inf"
	return var_to_str(value).to_float()


func _encode_object(object: Object) -> Variant:
	if not is_instance_valid(object):
		return null
	var display_class := _display_class(object)
	if object is Resource:
		var resource_path := (object as Resource).resource_path
		if not resource_path.is_empty() and not resource_path.contains("::"):
			return resource_path
		return "<%s>" % display_class
	if object is Node:
		return "<%s %s>" % [display_class, (object as Node).name]
	return "<%s>" % display_class


func _encode_items(items: Array) -> Array:
	var encoded: Array = []
	for item in items.slice(0, MAXIMUM_ENCODED_ITEMS):
		encoded.append(encode(item))
	if items.size() > MAXIMUM_ENCODED_ITEMS:
		encoded.append("… %d more" % (items.size() - MAXIMUM_ENCODED_ITEMS))
	return encoded


func _encode_dictionary(dictionary: Dictionary) -> Dictionary:
	var encoded := {}
	for key in dictionary:
		encoded[str(key)] = encode(dictionary[key])
	return encoded


static func _display_class(object: Object) -> String:
	var script := object.get_script() as Script
	if script != null and not script.get_global_name().is_empty():
		return script.get_global_name()
	return object.get_class()
