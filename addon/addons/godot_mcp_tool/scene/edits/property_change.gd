extends "scene_edit.gd"

var _scene_root: Node
var _node: Node
var _decoded: Dictionary
var _rejected: Array


func prepare(scene_root: Node, params: Dictionary) -> GodotMcpCommandError:
	var node_path: Variant = GodotMcpParams.required_text(params, "path", "\"Player/Camera\", or \".\" for the scene root")
	var properties: Variant = GodotMcpParams.dictionary(params, "properties")
	for value in [node_path, properties]:
		if value is GodotMcpCommandError:
			return value
	if (properties as Dictionary).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"properties\" needs at least one property", "Example: {\"position\": [0, 1, 0]}")
	var node := GodotMcpNodeLocator.find(scene_root, node_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(scene_root, node_path))
	var planned := _context.properties.plan(node, properties)
	_scene_root = scene_root
	_node = node
	_decoded = planned["decoded"]
	_rejected = planned["rejected"]
	changes = planned["changes"]
	action_name = "MCP: Set properties of %s" % node.name
	return null


func finish() -> Dictionary:
	var report := _context.properties.report(_node, _decoded, _rejected)
	return {
		"path": GodotMcpNodeLocator.path_of(_scene_root, _node),
		"applied": report["applied"],
		"rejected": report["rejected"],
		"not_applied": report["not_applied"],
	}
