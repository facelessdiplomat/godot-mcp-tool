extends RefCounted

const GodotMcpSimilarNames := preload("../util/similar_names.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const CALL_SUFFIX := "()"
const GETTER_PREFIXES := ["is_", "get_", "has_", "can_"]

var _codec: GodotMcpVariantCodec


func _init(codec: GodotMcpVariantCodec) -> void:
	_codec = codec


static func is_call(requested_name: String) -> bool:
	return requested_name.ends_with(CALL_SUFFIX)


func read(object: Object, call_text: String) -> Dictionary:
	var method_name := call_text.trim_suffix(CALL_SUFFIX)
	if not _is_getter_name(method_name):
		return {"name": call_text, "error": "Only methods whose names start with is_, get_, has_ or can_ can be read this way."}
	var method := _method_named(object, method_name)
	if method.is_empty():
		return {"name": call_text, "error": _unknown_method_message(object, method_name)}
	var required_arguments := (method["args"] as Array).size() - (method["default_args"] as Array).size()
	if required_arguments > 0:
		return {"name": call_text, "error": "%s() needs %d argument(s), so it cannot be read like a property." % [method_name, required_arguments]}
	var value: Variant = object.call(method_name)
	return {"name": call_text, "type": type_string(typeof(value)), "value": _codec.encode(value)}


static func _is_getter_name(method_name: String) -> bool:
	return GETTER_PREFIXES.any(func(prefix: String) -> bool: return method_name.begins_with(prefix))


static func _method_named(object: Object, method_name: String) -> Dictionary:
	for method in object.get_method_list():
		if method["name"] == method_name:
			return method
	return {}


static func _unknown_method_message(object: Object, method_name: String) -> String:
	var getter_names: Array = []
	for method in object.get_method_list():
		if _is_getter_name(str(method["name"])):
			getter_names.append(str(method["name"]))
	var message := "%s has no method %s()." % [object.get_class(), method_name]
	var similar := GodotMcpSimilarNames.hint(method_name, getter_names)
	return message if similar.is_empty() else "%s %s" % [message, similar]
