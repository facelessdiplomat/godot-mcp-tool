extends "scene_edit.gd"

var _scene_root: Node
var _node: Node
var _properties: Dictionary


func prepare(scene_root: Node, params: Dictionary) -> GodotMcpCommandError:
	var type_text: Variant = GodotMcpParams.required_text(params, "type", "\"MeshInstance3D\" or \"res://props/crate.tscn\"")
	var parent_path: Variant = GodotMcpParams.text(params, "parent", ".")
	var node_name: Variant = GodotMcpParams.text(params, "name")
	var index: Variant = GodotMcpParams.whole_number(params, "index", -1)
	var properties: Variant = GodotMcpParams.dictionary(params, "properties")
	for value in [type_text, parent_path, node_name, index, properties]:
		if value is GodotMcpCommandError:
			return value
	var parent := GodotMcpNodeLocator.find(scene_root, parent_path)
	if parent == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Parent node \"%s\" not found" % parent_path, GodotMcpNodeLocator.not_found_hint(scene_root, parent_path))
	var created: Variant = _context.nodes.create(type_text)
	if created is GodotMcpCommandError:
		return created
	_scene_root = scene_root
	_node = created
	_properties = properties
	if not (node_name as String).is_empty():
		_node.name = node_name
	action_name = "MCP: Add %s" % _node.name
	changes.add_do_call(parent, &"add_child", [_node, true])
	changes.add_do_call(_node, &"set_owner", [scene_root])
	if index >= 0:
		changes.add_do_call(parent, &"move_child", [_node, mini(index, parent.get_child_count())])
	changes.add_undo_call(parent, &"remove_child", [_node])
	changes.add_undo_call(_node, &"set_owner", [null])
	changes.add_do_reference(_node)
	return null


func finish() -> Dictionary:
	var report := _context.properties.assign(_node, _properties)
	return {
		"path": GodotMcpNodeLocator.path_of(_scene_root, _node),
		"type": GodotMcpNodeFactory.display_class(_node),
		"applied": report["applied"],
		"rejected": report["rejected"],
		"not_applied": report["not_applied"],
	}
