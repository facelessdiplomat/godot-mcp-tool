extends RefCounted

const GodotMcpChangeSet := preload("../change_set.gd")
const GodotMcpCommandError := preload("../../commands/command_error.gd")
const GodotMcpEditingContext := preload("../editing_context.gd")
const GodotMcpJsonRpc := preload("../../bridge/json_rpc.gd")
const GodotMcpNodeFactory := preload("../node_factory.gd")
const GodotMcpNodeLocator := preload("../node_locator.gd")
const GodotMcpParams := preload("../../commands/params.gd")

var changes := GodotMcpChangeSet.new()
var action_name := ""

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func prepare(_scene_root: Node, _params: Dictionary) -> GodotMcpCommandError:
	return GodotMcpCommandError.new(GodotMcpJsonRpc.INTERNAL_ERROR, "%s does not implement prepare()" % (get_script() as Script).resource_path)


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


static func name_problem(parent: Node, node_name: String, moving: Node) -> GodotMcpCommandError:
	if node_name.validate_node_name() != node_name:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" is not a valid node name" % node_name, "Node names cannot contain . : @ / \" or %.")
	var sibling := parent.get_node_or_null(NodePath(node_name))
	if sibling != null and sibling != moving:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s already has a child named %s" % [parent.name, node_name], "Pick another name.")
	return null
