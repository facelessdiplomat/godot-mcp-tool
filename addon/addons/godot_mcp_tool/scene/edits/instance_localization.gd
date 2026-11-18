extends "scene_edit.gd"

const UNIQUE_NAME_PREFIX := "%"

var _scene_root: Node
var _instance: Node
var _scene_file := ""
var _taken_over := 0


func prepare(scene_root: Node, params: Dictionary) -> GodotMcpCommandError:
	var node_path: Variant = GodotMcpParams.required_text(params, "path", "\"Enemy2\"")
	if node_path is GodotMcpCommandError:
		return node_path
	var node := GodotMcpNodeLocator.find(scene_root, node_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(scene_root, node_path))
	if node == scene_root or node.scene_file_path.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" is not an instance of another scene" % node_path, "Make Local works on the nodes that scene_get_tree marks with [instance …].")
	if is_inside_instance(node, scene_root):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" belongs to an instanced scene" % node_path, "Make the instance that contains it local first.")
	_scene_root = scene_root
	_instance = node
	_scene_file = node.scene_file_path
	action_name = "MCP: Make %s local" % node.name
	changes.add_do_call(node, &"set_scene_file_path", [""])
	changes.add_undo_call(node, &"set_scene_file_path", [_scene_file])
	_take_over(node)
	_strip_connection_inheritance(node)
	return null


func finish() -> Dictionary:
	return {
		"path": GodotMcpNodeLocator.path_of(_scene_root, _instance),
		"scene_file": _scene_file,
		"taken_over": _taken_over,
	}


func _take_over(node: Node) -> void:
	for child in node.get_children():
		if child.owner == _instance:
			var unique_name_clashes := child.is_unique_name_in_owner() and _scene_root.get_node_or_null(UNIQUE_NAME_PREFIX + str(child.name)) != null
			if unique_name_clashes:
				changes.add_do_call(child, &"set_unique_name_in_owner", [false])
			changes.add_do_call(child, &"set_owner", [_scene_root])
			changes.add_undo_call(child, &"set_owner", [_instance])
			if unique_name_clashes:
				changes.add_undo_call(child, &"set_unique_name_in_owner", [true])
			_taken_over += 1
		_take_over(child)


func _strip_connection_inheritance(node: Node) -> void:
	for description in node.get_signal_list():
		for connection in node.get_signal_connection_list(description["name"]):
			if not GodotMcpInstancedScenes.is_inherited(connection):
				continue
			var signal_name: StringName = description["name"]
			var callable: Callable = connection["callable"]
			var flags := int(connection["flags"])
			changes.add_do_call(node, &"disconnect", [signal_name, callable])
			changes.add_do_call(node, &"connect", [signal_name, callable, flags & ~GodotMcpInstancedScenes.INHERITED_CONNECTION_FLAG])
			changes.add_undo_call(node, &"disconnect", [signal_name, callable])
			changes.add_undo_call(node, &"connect", [signal_name, callable, flags])
	for child in node.get_children():
		_strip_connection_inheritance(child)
