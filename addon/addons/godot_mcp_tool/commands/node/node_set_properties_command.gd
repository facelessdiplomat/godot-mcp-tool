extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = Params.required_text(params, "path", "\"Player/Camera\", or \".\" for the scene root")
	var scene_path: Variant = Params.text(params, "scene")
	var properties: Variant = Params.dictionary(params, "properties")
	for value in [node_path, scene_path, properties]:
		if value is CommandError:
			return value
	if (properties as Dictionary).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"properties\" needs at least one property", "Example: {\"position\": [0, 1, 0]}")
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is CommandError:
		return resolved
	var scene_root := resolved as Node
	var node := NodeLocator.find(scene_root, node_path)
	if node == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, NodeLocator.not_found_hint(scene_root, node_path))
	var report := _context.properties.apply(node, properties, _context.history, "MCP: Set properties of %s" % node.name, scene_root)
	return {
		"scene": scene_root.scene_file_path,
		"path": NodeLocator.path_of(scene_root, node),
		"applied": report["applied"],
		"rejected": report["rejected"],
		"not_applied": report["not_applied"],
	}
