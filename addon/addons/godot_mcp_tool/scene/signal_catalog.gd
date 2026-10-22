extends RefCounted

const NodeFactory := preload("node_factory.gd")
const NodeLocator := preload("node_locator.gd")
const SimilarNames := preload("../util/similar_names.gd")
const VariantCodec := preload("../codec/variant_codec.gd")

const FLAG_NAMES := {CONNECT_DEFERRED: "deferred", CONNECT_ONE_SHOT: "one_shot"}


static func find_signal(object: Object, signal_name: String) -> Dictionary:
	for description in object.get_signal_list():
		if description["name"] == signal_name:
			return description
	return {}


static func unknown_signal_hint(object: Object, signal_name: String) -> String:
	var names: Array = object.get_signal_list().map(func(description: Dictionary) -> String: return description["name"])
	var similar := SimilarNames.hint(signal_name, names)
	return similar if not similar.is_empty() else "signal_list with the node's path shows its signals."


static func arguments_text(signal_description: Dictionary) -> String:
	var parts := PackedStringArray()
	for argument in signal_description["args"]:
		parts.append("%s: %s" % [argument["name"], _type_text(argument)])
	return ", ".join(parts)


static func suggested_function(method_name: String, signal_description: Dictionary, binds: Array) -> String:
	var parameters := PackedStringArray()
	if not (signal_description["args"] as Array).is_empty():
		parameters.append(arguments_text(signal_description))
	for index in binds.size():
		parameters.append("bound_%d: %s" % [index + 1, type_string(typeof(binds[index]))])
	return "func %s(%s) -> void:" % [method_name, ", ".join(parameters)]


static func missing_method_hint(target: Node, method_name: String, signal_description: Dictionary, binds: Array) -> String:
	var function := suggested_function(method_name, signal_description, binds)
	var script := target.get_script() as Script
	if script == null:
		return "%s has no script. Attach one with node_set_properties {\"script\": \"res://….gd\"} that defines %s" % [target.name, function]
	var place := script.resource_path if not script.resource_path.is_empty() else "the script of %s" % target.name
	return "Add %s to %s, then call editor_rescan so the editor sees it." % [function, place]


static func arity_problem(target: Object, method_name: String, signal_description: Dictionary, binds: Array) -> String:
	var method := _method_description(target, method_name)
	if method.is_empty() or int(method["flags"]) & METHOD_FLAG_VARARG:
		return ""
	var maximum := (method["args"] as Array).size()
	var required := maximum - (method["default_args"] as Array).size()
	var passed := (signal_description["args"] as Array).size() + binds.size()
	if passed >= required and passed <= maximum:
		return ""
	var bound := "" if binds.is_empty() else " with %d bound %s" % [binds.size(), "value" if binds.size() == 1 else "values"]
	return "%s.%s() takes %d %s, but %s passes %d%s" % [
		target.get("name"), method_name, maximum, "argument" if maximum == 1 else "arguments", signal_description["name"], passed, bound,
	]


static func saved_connections(node: Node, signal_name: String = "") -> Array[Dictionary]:
	var connections: Array[Dictionary] = []
	for description in node.get_signal_list():
		if not signal_name.is_empty() and description["name"] != signal_name:
			continue
		for connection in node.get_signal_connection_list(description["name"]):
			if int(connection["flags"]) & CONNECT_PERSIST:
				connections.append(connection)
	return connections


static func describe_connection(scene_root: Node, source: Node, connection: Dictionary, codec: VariantCodec) -> Dictionary:
	var callable: Callable = connection["callable"]
	return {
		"from": NodeLocator.path_of(scene_root, source),
		"signal": str((connection["signal"] as Signal).get_name()),
		"to": target_text(scene_root, callable.get_object()),
		"method": str(callable.get_method()),
		"flags": flag_names(int(connection["flags"])),
		"binds": codec.encode(callable.get_bound_arguments()),
	}


static func target_text(scene_root: Node, target: Object) -> String:
	if target is Node and (target == scene_root or scene_root.is_ancestor_of(target)):
		return NodeLocator.path_of(scene_root, target)
	return NodeFactory.display_class(target) if target != null else "a freed object"


static func flag_names(flags: int) -> Array:
	var names: Array = []
	for flag in FLAG_NAMES:
		if flags & flag:
			names.append(FLAG_NAMES[flag])
	return names


static func _method_description(object: Object, method_name: String) -> Dictionary:
	for method in object.get_method_list():
		if method["name"] == method_name:
			return method
	return {}


static func _type_text(argument: Dictionary) -> String:
	var type: int = argument["type"]
	if type == TYPE_OBJECT and not str(argument["class_name"]).is_empty():
		return str(argument["class_name"])
	return "Variant" if type == TYPE_NIL else type_string(type)
