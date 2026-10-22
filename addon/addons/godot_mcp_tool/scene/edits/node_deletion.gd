extends "scene_edit.gd"

var _deleted_paths: Array = []


func prepare(scene_root: Node, params: Dictionary) -> CommandError:
	var paths: Variant = Params.text_list(params, "paths")
	if paths is CommandError:
		return paths
	if (paths as Array).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"paths\" needs at least one node path", "Example: [\"Player/Camera\"]")
	var nodes: Array[Node] = []
	for path_text in paths:
		var node := NodeLocator.find(scene_root, path_text)
		if node == null:
			return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found; nothing was deleted" % path_text, NodeLocator.not_found_hint(scene_root, path_text))
		if node == scene_root:
			return CommandError.new(JsonRpc.INVALID_PARAMS, "The scene root cannot be deleted", "Create another scene with scene_create instead.")
		if is_inside_instance(node, scene_root):
			return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" belongs to an instanced scene and cannot be deleted here" % path_text, "Delete the instance itself, or edit the instanced scene.")
		nodes.append(node)
	var top_level_nodes := _without_descendants(nodes)
	_deleted_paths = top_level_nodes.map(func(node: Node) -> String: return NodeLocator.path_of(scene_root, node))
	var names := PackedStringArray(top_level_nodes.map(func(node: Node) -> String: return str(node.name)))
	action_name = "MCP: Delete %s" % ", ".join(names)
	for node in top_level_nodes:
		var parent := node.get_parent()
		var owned_nodes := owned_subtree(node, scene_root)
		changes.add_do_call(parent, &"remove_child", [node])
		for owned_node in owned_nodes:
			changes.add_do_call(owned_node, &"set_owner", [null])
		changes.add_undo_call(parent, &"add_child", [node, true])
		changes.add_undo_call(parent, &"move_child", [node, node.get_index()])
		for owned_node in owned_nodes:
			changes.add_undo_call(owned_node, &"set_owner", [scene_root])
		changes.add_undo_reference(node)
	return null


func finish() -> Dictionary:
	return {"deleted": _deleted_paths}


static func _without_descendants(nodes: Array[Node]) -> Array[Node]:
	var top_level_nodes: Array[Node] = []
	for node in nodes:
		var has_selected_ancestor := nodes.any(func(other: Node) -> bool: return other != node and other.is_ancestor_of(node))
		if not has_selected_ancestor and not node in top_level_nodes:
			top_level_nodes.append(node)
	top_level_nodes.sort_custom(func(left: Node, right: Node) -> bool: return left.get_index() < right.get_index())
	return top_level_nodes
