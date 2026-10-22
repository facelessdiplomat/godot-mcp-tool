extends "../command.gd"

const ChangeSet := preload("../../scene/change_set.gd")
const EditingContext := preload("../../scene/editing_context.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")
const SimilarNames := preload("../../util/similar_names.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = Params.required_text(params, "path", "\"Camera\"")
	var method_name: Variant = Params.required_text(params, "method", "\"look_at\"")
	var scene_path: Variant = Params.text(params, "scene")
	for value in [node_path, method_name, scene_path]:
		if value is CommandError:
			return value
	var arguments: Variant = params.get("args", [])
	if not arguments is Array:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"args\" must be a list", "Example: [[0, 0, 0]]")
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is CommandError:
		return resolved
	var scene_root := resolved as Node
	var node := NodeLocator.find(scene_root, node_path)
	if node == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, NodeLocator.not_found_hint(scene_root, node_path))
	var method_info := _method_info(node, method_name)
	if method_info.is_empty():
		var method_names := node.get_method_list().map(func(method: Dictionary) -> String: return method["name"])
		var similar := SimilarNames.hint(method_name, method_names)
		return CommandError.new(JsonRpc.NOT_FOUND, "%s has no method %s" % [NodeFactory.display_class(node), method_name], similar if not similar.is_empty() else "docs_class lists the methods of a class.")
	var decoded: Variant = _decode_arguments(node, method_info, arguments)
	if decoded is CommandError:
		return decoded
	var before := {}
	for property_name in _context.properties.editable_properties(node):
		before[property_name] = node.get(property_name)
	var value: Variant = node.callv(method_name, decoded)
	var changes := ChangeSet.new()
	var changed: Array = []
	for property_name in before:
		var after: Variant = node.get(property_name)
		if typeof(after) == typeof(before[property_name]) and after == before[property_name]:
			continue
		changed.append(property_name)
		changes.add_do_property(node, property_name, after)
		changes.add_undo_property(node, property_name, before[property_name])
	if not changes.is_empty():
		_context.history.record("MCP: Call %s on %s" % [method_name, node.name], scene_root, [changes], false)
	return {
		"scene": scene_root.scene_file_path,
		"path": NodeLocator.path_of(scene_root, node),
		"method": method_name,
		"value": _context.codec.encode(value),
		"changed": changed,
	}


static func _method_info(node: Node, method_name: String) -> Dictionary:
	for method in node.get_method_list():
		if method["name"] == method_name:
			return method
	return {}


func _decode_arguments(node: Node, method_info: Dictionary, arguments: Array) -> Variant:
	var method_name := str(method_info["name"])
	var parameters: Array = method_info["args"]
	var optional_count := (method_info["default_args"] as Array).size()
	var takes_any_more := int(method_info["flags"]) & METHOD_FLAG_VARARG != 0
	if arguments.size() < parameters.size() - optional_count or (arguments.size() > parameters.size() and not takes_any_more):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s takes %s; got %d" % [method_name, _describe_parameters(parameters, optional_count), arguments.size()], "Pass the arguments in order in \"args\".")
	var decoded: Array = []
	for index in arguments.size():
		if index >= parameters.size():
			decoded.append(arguments[index])
			continue
		var parameter: Dictionary = parameters[index]
		var outcome := _context.codec.decode(arguments[index], parameter, node)
		if not outcome.is_success:
			return CommandError.new(JsonRpc.INVALID_PARAMS, "Argument %d (%s) of %s: %s" % [index + 1, parameter["name"], method_name, outcome.error])
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
