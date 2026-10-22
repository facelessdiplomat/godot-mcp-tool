extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var paths: Variant = Params.text_list(params, "paths")
	var scene_path: Variant = Params.text(params, "scene")
	for value in [paths, scene_path]:
		if value is CommandError:
			return value
	if (paths as Array).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"paths\" needs at least one node path", "Example: [\"Player/Camera\"]")
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is CommandError:
		return resolved
	var scene_root := resolved as Node
	var nodes: Array[Node] = []
	for path_text in paths:
		var node := NodeLocator.find(scene_root, path_text)
		if node == null:
			return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found; nothing was deleted" % path_text, NodeLocator.not_found_hint(scene_root, path_text))
		if node == scene_root:
			return CommandError.new(JsonRpc.INVALID_PARAMS, "The scene root cannot be deleted", "Create another scene with scene_create instead.")
		if node.owner != scene_root:
			return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" belongs to an instanced scene and cannot be deleted here" % path_text, "Delete the instance itself, or edit the instanced scene.")
		nodes.append(node)
	var top_level_nodes := _without_descendants(nodes)
	var deleted_paths: Array = top_level_nodes.map(func(node: Node) -> String: return NodeLocator.path_of(scene_root, node))
	_delete_with_undo(scene_root, top_level_nodes)
	return {"scene": scene_root.scene_file_path, "deleted": deleted_paths}


func _delete_with_undo(scene_root: Node, nodes: Array[Node]) -> void:
	var history := _context.history
	var names := PackedStringArray(nodes.map(func(node: Node) -> String: return str(node.name)))
	history.begin("MCP: Delete %s" % ", ".join(names), scene_root)
	for node in nodes:
		var parent := node.get_parent()
		var owned_nodes := _owned_subtree(node, scene_root)
		history.add_do_call(parent, &"remove_child", [node])
		for owned_node in owned_nodes:
			history.add_do_call(owned_node, &"set_owner", [null])
		history.add_undo_call(parent, &"add_child", [node, true])
		history.add_undo_call(parent, &"move_child", [node, node.get_index()])
		for owned_node in owned_nodes:
			history.add_undo_call(owned_node, &"set_owner", [scene_root])
		history.add_undo_reference(node)
	history.commit()


static func _without_descendants(nodes: Array[Node]) -> Array[Node]:
	var top_level_nodes: Array[Node] = []
	for node in nodes:
		var has_selected_ancestor := nodes.any(func(other: Node) -> bool: return other != node and other.is_ancestor_of(node))
		if not has_selected_ancestor and not node in top_level_nodes:
			top_level_nodes.append(node)
	top_level_nodes.sort_custom(func(left: Node, right: Node) -> bool: return left.get_index() < right.get_index())
	return top_level_nodes


static func _owned_subtree(node: Node, scene_root: Node) -> Array[Node]:
	var owned: Array[Node] = [node]
	for child in node.get_children():
		if child.owner == scene_root:
			owned.append_array(_owned_subtree(child, scene_root))
	return owned
