extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var type_text: Variant = Params.required_text(params, "type", "\"MeshInstance3D\" or \"res://props/crate.tscn\"")
	var scene_path: Variant = Params.text(params, "scene")
	var parent_path: Variant = Params.text(params, "parent", ".")
	var node_name: Variant = Params.text(params, "name")
	var index: Variant = Params.whole_number(params, "index", -1)
	var properties: Variant = Params.dictionary(params, "properties")
	for value in [type_text, scene_path, parent_path, node_name, index, properties]:
		if value is CommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is CommandError:
		return resolved
	var scene_root := resolved as Node
	var parent := NodeLocator.find(scene_root, parent_path)
	if parent == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Parent node \"%s\" not found" % parent_path, NodeLocator.not_found_hint(scene_root, parent_path))
	var created: Variant = _context.nodes.create(type_text)
	if created is CommandError:
		return created
	var node := created as Node
	if not (node_name as String).is_empty():
		node.name = node_name
	_add_with_undo(scene_root, parent, node, mini(index, parent.get_child_count()))
	var report := _context.properties.assign(node, properties)
	return {
		"scene": scene_root.scene_file_path,
		"path": NodeLocator.path_of(scene_root, node),
		"type": NodeFactory.display_class(node),
		"applied": report["applied"],
		"rejected": report["rejected"],
		"not_applied": report["not_applied"],
	}


func _add_with_undo(scene_root: Node, parent: Node, node: Node, index: int) -> void:
	var history := _context.history
	history.begin("MCP: Add %s" % node.name, scene_root)
	history.add_do_call(parent, &"add_child", [node, true])
	history.add_do_call(node, &"set_owner", [scene_root])
	if index >= 0:
		history.add_do_call(parent, &"move_child", [node, index])
	history.add_undo_call(parent, &"remove_child", [node])
	history.add_undo_call(node, &"set_owner", [null])
	history.add_do_reference(node)
	history.commit()
