extends RefCounted

const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")


static func info_of(object: Object, method_name: String) -> Dictionary:
	for method in object.get_method_list():
		if method["name"] == method_name:
			return method
	return {}


static func names_of(object: Object) -> Array:
	return object.get_method_list().map(func(method: Dictionary) -> String: return method["name"])


static func count_problem(method_info: Dictionary, given: int) -> String:
	var parameters: Array = method_info["args"]
	var optional_count := (method_info["default_args"] as Array).size()
	var takes_any_more := int(method_info["flags"]) & METHOD_FLAG_VARARG != 0
	if given >= parameters.size() - optional_count and (given <= parameters.size() or takes_any_more):
		return ""
	return "%s takes %s; got %d" % [method_info["name"], _describe_parameters(parameters, optional_count), given]


static func decode(codec: GodotMcpVariantCodec, object: Object, method_info: Dictionary, arguments: Array) -> Variant:
	var parameters: Array = method_info["args"]
	var decoded: Array = []
	for index in arguments.size():
		if index >= parameters.size():
			decoded.append(arguments[index])
			continue
		var parameter: Dictionary = parameters[index]
		var outcome := codec.decode(arguments[index], parameter, object)
		if not outcome.is_success:
			return "Argument %d (%s) of %s: %s" % [index + 1, parameter["name"], method_info["name"], outcome.error]
		decoded.append(outcome.value)
	return decoded


static func _describe_parameters(parameters: Array, optional_count: int) -> String:
	if parameters.is_empty():
		return "no arguments"
	var descriptions := PackedStringArray()
	for index in parameters.size():
		var parameter: Dictionary = parameters[index]
		var type_name := str(parameter["class_name"]) if parameter["type"] == TYPE_OBJECT and not str(parameter["class_name"]).is_empty() else type_string(parameter["type"])
		var optional_mark := " (optional)" if index >= parameters.size() - optional_count else ""
		descriptions.append("%s: %s%s" % [parameter["name"], type_name, optional_mark])
	return ", ".join(descriptions)
