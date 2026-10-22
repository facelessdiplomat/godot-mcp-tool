extends RefCounted

const ChangeSet := preload("../change_set.gd")
const CommandError := preload("../../commands/command_error.gd")
const EditingContext := preload("../editing_context.gd")
const JsonRpc := preload("../../bridge/json_rpc.gd")
const NodeFactory := preload("../node_factory.gd")
const NodeLocator := preload("../node_locator.gd")
const Params := preload("../../commands/params.gd")

var changes := ChangeSet.new()
var action_name := ""

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func prepare(_scene_root: Node, _params: Dictionary) -> CommandError:
	return CommandError.new(JsonRpc.INTERNAL_ERROR, "%s does not implement prepare()" % (get_script() as Script).resource_path)


func finish() -> Dictionary:
	return {}


static func owned_subtree(node: Node, scene_root: Node) -> Array[Node]:
	var owned: Array[Node] = [node]
	for child in node.get_children():
		if child.owner == scene_root:
			owned.append_array(owned_subtree(child, scene_root))
	return owned


static func is_inside_instance(node: Node, scene_root: Node) -> bool:
	return node != scene_root and node.owner != scene_root


static func name_problem(parent: Node, node_name: String, moving: Node) -> CommandError:
	if node_name.validate_node_name() != node_name:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" is not a valid node name" % node_name, "Node names cannot contain . : @ / \" or %.")
	var sibling := parent.get_node_or_null(NodePath(node_name))
	if sibling != null and sibling != moving:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s already has a child named %s" % [parent.name, node_name], "Pick another name.")
	return null
