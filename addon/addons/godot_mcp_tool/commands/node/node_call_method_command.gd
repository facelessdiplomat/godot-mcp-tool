extends "../command.gd"

const GodotMcpChangeSet := preload("../../scene/change_set.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpInstancedScenes := preload("../../scene/instanced_scenes.gd")
const GodotMcpMethodArguments := preload("../../scene/method_arguments.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSimilarNames := preload("../../util/similar_names.gd")

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = GodotMcpParams.required_text(params, "path", "\"Camera\"")
	var method_name: Variant = GodotMcpParams.required_text(params, "method", "\"look_at\"")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	for value in [node_path, method_name, scene_path]:
		if value is GodotMcpCommandError:
			return value
	var arguments: Variant = params.get("args", [])
	if not arguments is Array:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"args\" must be a list", "Example: [[0, 0, 0]]")
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	var node := GodotMcpNodeLocator.find(scene_root, node_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(scene_root, node_path))
	var method_info := GodotMcpMethodArguments.info_of(node, method_name)
	if method_info.is_empty():
		var similar := GodotMcpSimilarNames.hint(method_name, GodotMcpMethodArguments.names_of(node))
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s has no method %s" % [GodotMcpNodeFactory.display_class(node), method_name], similar if not similar.is_empty() else "docs_class lists the methods of a class.")
	var count_problem := GodotMcpMethodArguments.count_problem(method_info, (arguments as Array).size())
	if not count_problem.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, count_problem, "Pass the arguments in order in \"args\".")
	var decoded: Variant = GodotMcpMethodArguments.decode(_context.codec, node, method_info, arguments)
	if decoded is String:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, decoded)
	var before := {}
	for property_name in _context.properties.editable_properties(node):
		before[property_name] = node.get(property_name)
	var value: Variant = node.callv(method_name, decoded)
	var changes := GodotMcpChangeSet.new()
	var changed: Array = []
	for property_name in before:
		var after: Variant = node.get(property_name)
		if typeof(after) == typeof(before[property_name]) and after == before[property_name]:
			continue
		changed.append(property_name)
		changes.add_do_property(node, property_name, after)
		changes.add_undo_property(node, property_name, before[property_name])
	var editable_children: Array = []
	if not changes.is_empty():
		var editable_children_changes := GodotMcpChangeSet.new()
		editable_children = GodotMcpInstancedScenes.turn_on_editable_children_for(node, scene_root, editable_children_changes)
		editable_children_changes.apply()
		_context.history.record("MCP: Call %s on %s" % [method_name, node.name], scene_root, [changes, editable_children_changes], false)
	return {
		"scene": scene_root.scene_file_path,
		"path": GodotMcpNodeLocator.path_of(scene_root, node),
		"method": method_name,
		"value": _context.codec.encode(value),
		"changed": changed,
		"editable_children": editable_children,
	}

