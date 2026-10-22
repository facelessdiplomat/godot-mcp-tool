extends "scene_edit.gd"

const SceneTreeDescriber := preload("../scene_tree_describer.gd")

const INTERNAL_GROUP_PREFIX := "_"

var _scene_root: Node
var _node: Node
var _added: Array = []
var _removed: Array = []
var _unchanged: Array = []


func prepare(scene_root: Node, params: Dictionary) -> CommandError:
	var node_path: Variant = Params.required_text(params, "path", "\"Goblin\", or \".\" for the scene root")
	var groups_to_add: Variant = Params.text_list(params, "add")
	var groups_to_remove: Variant = Params.text_list(params, "remove")
	for value in [node_path, groups_to_add, groups_to_remove]:
		if value is CommandError:
			return value
	var additions := _trimmed(groups_to_add)
	var removals := _trimmed(groups_to_remove)
	if additions.is_empty() and removals.is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "Pass groups to add or to remove", "Example: {\"path\": \"Goblin\", \"add\": [\"enemies\"]}")
	for group in additions + removals:
		var problem := _group_name_problem(group)
		if problem != null:
			return problem
	var node := NodeLocator.find(scene_root, node_path)
	if node == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, NodeLocator.not_found_hint(scene_root, node_path))
	_scene_root = scene_root
	_node = node
	for group in additions:
		if node.is_in_group(group) or group in _added:
			_unchanged.append(group)
			continue
		_added.append(group)
		changes.add_do_call(node, &"add_to_group", [group, true])
		changes.add_undo_call(node, &"remove_from_group", [group])
	for group in removals:
		if not node.is_in_group(group) or group in _removed:
			_unchanged.append(group)
			continue
		_removed.append(group)
		changes.add_do_call(node, &"remove_from_group", [group])
		changes.add_undo_call(node, &"add_to_group", [group, true])
	action_name = "MCP: Set groups of %s" % node.name
	return null


func finish() -> Dictionary:
	return {
		"path": NodeLocator.path_of(_scene_root, _node),
		"groups": SceneTreeDescriber.visible_groups(_node),
		"added": _added,
		"removed": _removed,
		"unchanged": _unchanged,
	}


static func _trimmed(groups: Array) -> Array:
	return groups.map(func(group: String) -> String: return group.strip_edges())


static func _group_name_problem(group: String) -> CommandError:
	if group.is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "Group names cannot be empty")
	if group.begins_with(INTERNAL_GROUP_PREFIX):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" starts with _, which marks internal groups that the scene tools do not show" % group, "Pick a name without the leading _.")
	return null
