extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")
const SceneSnapshot := preload("../../scene/scene_snapshot.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = Params.required_text(params, "path", "\"Player/Camera\", or \".\" for the scene root")
	var scene_path: Variant = Params.text(params, "scene")
	var names: Variant = Params.text_list(params, "names")
	var include_defaults: Variant = Params.flag(params, "include_defaults", false)
	for value in [node_path, scene_path, names, include_defaults]:
		if value is CommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is CommandError:
		return resolved
	var snapshot := resolved as SceneSnapshot
	var node := NodeLocator.find(snapshot.root, node_path)
	if node == null:
		var error := CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, NodeLocator.not_found_hint(snapshot.root, node_path))
		snapshot.release()
		return error
	var result := {
		"scene": snapshot.scene_path,
		"path": NodeLocator.path_of(snapshot.root, node),
		"type": NodeFactory.display_class(node),
		"properties": _context.properties.describe(node, PackedStringArray(names), include_defaults),
	}
	snapshot.release()
	return result
