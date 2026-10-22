extends "scene_edit.gd"

const NodePathUpdates := preload("../node_path_updates.gd")
const SpatialTransforms := preload("../spatial_transforms.gd")

var _scene_root: Node
var _node: Node
var _previous_path: String
var _updates: Array[Dictionary] = []


func prepare(scene_root: Node, params: Dictionary) -> CommandError:
	var node_path: Variant = Params.required_text(params, "path", "\"Props/Crate\"")
	var parent_path: Variant = Params.text(params, "parent")
	var new_name: Variant = Params.text(params, "name")
	var index: Variant = Params.whole_number(params, "index", -1)
	var keeps_global_transform: Variant = Params.flag(params, "keep_global_transform", true)
	for value in [node_path, parent_path, new_name, index, keeps_global_transform]:
		if value is CommandError:
			return value
	if (parent_path as String).is_empty() and (new_name as String).is_empty() and index < 0:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "Give a new parent, a new name or an index", "Example: {\"path\": \"Crate\", \"parent\": \"Props\"}")
	var node := NodeLocator.find(scene_root, node_path)
	if node == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, NodeLocator.not_found_hint(scene_root, node_path))
	if node == scene_root and (not (parent_path as String).is_empty() or index >= 0):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "The scene root cannot be moved", "Only its name can change here.")
	if is_inside_instance(node, scene_root):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" belongs to an instanced scene and cannot be moved here" % node_path, "Move the instance itself, or edit the instanced scene.")
	var old_parent := node.get_parent()
	var new_parent := old_parent
	if not (parent_path as String).is_empty():
		new_parent = NodeLocator.find(scene_root, parent_path)
		if new_parent == null:
			return CommandError.new(JsonRpc.NOT_FOUND, "Parent node \"%s\" not found" % parent_path, NodeLocator.not_found_hint(scene_root, parent_path))
		if new_parent == node or node.is_ancestor_of(new_parent):
			return CommandError.new(JsonRpc.INVALID_PARAMS, "%s cannot be moved into itself or its own children" % node.name, "Pick a parent outside of %s." % node_path)
		if is_inside_instance(new_parent, scene_root):
			return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" is inside an instanced scene, so nodes cannot be moved into it" % parent_path, "Pick a parent that belongs to this scene.")
	var old_name := str(node.name)
	var final_name: String = old_name if (new_name as String).is_empty() else new_name
	var moves_parent := new_parent != old_parent
	if node != scene_root and (moves_parent or final_name != old_name):
		var problem := name_problem(new_parent, final_name, node)
		if problem != null:
			if (new_name as String).is_empty():
				problem.hint = "Pass name to rename %s while moving it." % old_name
			return problem
	_scene_root = scene_root
	_node = node
	_previous_path = NodeLocator.path_of(scene_root, node)
	if node != scene_root and (moves_parent or final_name != old_name):
		_updates = NodePathUpdates.plan(scene_root, node, new_parent, final_name)
	action_name = "MCP: Rename %s to %s" % [old_name, final_name] if not moves_parent and index < 0 else "MCP: Move %s" % old_name
	if moves_parent:
		_plan_reparent(node, old_parent, new_parent, old_name, final_name, index, keeps_global_transform)
	else:
		_plan_in_place(node, old_parent, old_name, final_name, index)
	for update in _updates:
		changes.add_do_property(update["node"], update["property"], update["new_path"])
		changes.add_undo_property(update["node"], update["property"], update["old_path"])
	return null


func finish() -> Dictionary:
	return {
		"path": NodeLocator.path_of(_scene_root, _node),
		"previous_path": _previous_path,
		"type": NodeFactory.display_class(_node),
		"updated_references": _updates.map(_describe_update),
	}


func _plan_reparent(node: Node, old_parent: Node, new_parent: Node, old_name: String, final_name: String, index: int, keeps_global_transform: bool) -> void:
	var owned_nodes := owned_subtree(node, _scene_root)
	var new_index := mini(index if index >= 0 else new_parent.get_child_count(), new_parent.get_child_count())
	changes.add_do_call(old_parent, &"remove_child", [node])
	if final_name != old_name:
		changes.add_do_property(node, &"name", final_name)
	changes.add_do_call(new_parent, &"add_child", [node, true])
	changes.add_do_call(new_parent, &"move_child", [node, new_index])
	for owned_node in owned_nodes:
		changes.add_do_call(owned_node, &"set_owner", [_scene_root])
	var spatial := node as Node3D
	var adjusts_transform := keeps_global_transform and spatial != null and not spatial.top_level
	if adjusts_transform:
		changes.add_do_property(node, &"transform", SpatialTransforms.global_of(new_parent).affine_inverse() * SpatialTransforms.global_of(node))
	changes.add_undo_call(new_parent, &"remove_child", [node])
	if final_name != old_name:
		changes.add_undo_property(node, &"name", old_name)
	changes.add_undo_call(old_parent, &"add_child", [node, true])
	changes.add_undo_call(old_parent, &"move_child", [node, node.get_index()])
	for owned_node in owned_nodes:
		changes.add_undo_call(owned_node, &"set_owner", [_scene_root])
	if adjusts_transform:
		changes.add_undo_property(node, &"transform", spatial.transform)


func _plan_in_place(node: Node, parent: Node, old_name: String, final_name: String, index: int) -> void:
	if final_name != old_name:
		changes.add_do_property(node, &"name", final_name)
		changes.add_undo_property(node, &"name", old_name)
	if index >= 0:
		changes.add_do_call(parent, &"move_child", [node, mini(index, parent.get_child_count() - 1)])
		changes.add_undo_call(parent, &"move_child", [node, node.get_index()])


func _describe_update(update: Dictionary) -> Dictionary:
	return {"node": NodeLocator.path_of(_scene_root, update["node"]), "property": str(update["property"]), "path": str(update["new_path"])}
