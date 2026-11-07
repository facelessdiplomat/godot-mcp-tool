extends "scene_edit.gd"

const DUPLICATE_FLAGS := Node.DUPLICATE_SIGNALS | Node.DUPLICATE_GROUPS | Node.DUPLICATE_SCRIPTS | Node.DUPLICATE_USE_INSTANTIATION

var _scene_root: Node
var _source_path: String
var _copy: Node
var _properties: Dictionary


func prepare(scene_root: Node, params: Dictionary) -> GodotMcpCommandError:
	var node_path: Variant = GodotMcpParams.required_text(params, "path", "\"Props/Crate\"")
	var parent_path: Variant = GodotMcpParams.text(params, "parent")
	var copy_name: Variant = GodotMcpParams.text(params, "name")
	var properties: Variant = GodotMcpParams.dictionary(params, "properties")
	for value in [node_path, parent_path, copy_name, properties]:
		if value is GodotMcpCommandError:
			return value
	var node := GodotMcpNodeLocator.find(scene_root, node_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(scene_root, node_path))
	if node == scene_root:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "The scene root cannot be duplicated", "Duplicate its children instead, or make another scene with scene_create.")
	if is_inside_instance(node, scene_root):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" belongs to an instanced scene and cannot be duplicated here" % node_path, "Duplicate the instance itself.")
	var parent := node.get_parent() if (parent_path as String).is_empty() else GodotMcpNodeLocator.find(scene_root, parent_path)
	if parent == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Parent node \"%s\" not found" % parent_path, GodotMcpNodeLocator.not_found_hint(scene_root, parent_path))
	if is_inside_instance(parent, scene_root):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" is inside an instanced scene, so the copy cannot go there" % parent_path, "Pick a parent that belongs to this scene.")
	if not (copy_name as String).is_empty():
		var problem := name_problem(parent, copy_name, null)
		if problem != null:
			problem.hint = "Pick another name, or leave name out to number the copy."
			return problem
	_scene_root = scene_root
	_source_path = GodotMcpNodeLocator.path_of(scene_root, node)
	_properties = properties
	_copy = node.duplicate(DUPLICATE_FLAGS)
	if not (copy_name as String).is_empty():
		_copy.name = copy_name
	action_name = "MCP: Duplicate %s" % node.name
	var index := node.get_index() + 1 if parent == node.get_parent() else parent.get_child_count()
	changes.add_do_call(parent, &"add_child", [_copy, true])
	changes.add_do_call(parent, &"move_child", [_copy, index])
	for original in owned_subtree(node, scene_root):
		changes.add_do_call(_copy.get_node(node.get_path_to(original)), &"set_owner", [scene_root])
	changes.add_undo_call(parent, &"remove_child", [_copy])
	changes.add_undo_call(_copy, &"set_owner", [null])
	changes.add_do_reference(_copy)
	return null


func finish() -> Dictionary:
	var report := _context.properties.assign(_copy, _properties)
	return {
		"path": GodotMcpNodeLocator.path_of(_scene_root, _copy),
		"source": _source_path,
		"type": GodotMcpNodeFactory.display_class(_copy),
		"applied": report["applied"],
		"rejected": report["rejected"],
		"not_applied": report["not_applied"],
	}
