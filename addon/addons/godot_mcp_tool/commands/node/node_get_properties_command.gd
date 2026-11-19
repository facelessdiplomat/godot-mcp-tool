extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpNodeSelection := preload("../node_selection.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSceneSnapshot := preload("../../scene/scene_snapshot.gd")

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var selection: Variant = GodotMcpNodeSelection.read(params, "\"Player/Camera\", or \".\" for the scene root")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var names: Variant = GodotMcpParams.text_list(params, "names")
	var include_defaults: Variant = GodotMcpParams.flag(params, "include_defaults", false)
	for value in [selection, scene_path, names, include_defaults]:
		if value is GodotMcpCommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var snapshot := resolved as GodotMcpSceneSnapshot
	var result: Variant
	if selection is String:
		result = _describe(snapshot, selection, names, include_defaults)
	else:
		var nodes: Array = []
		for node_path: String in selection:
			nodes.append(GodotMcpNodeSelection.entry_of(node_path, _describe(snapshot, node_path, names, include_defaults)))
		result = {"scene": snapshot.scene_path, "nodes": nodes}
	snapshot.release()
	return result


func _describe(snapshot: GodotMcpSceneSnapshot, node_path: String, names: Array, include_defaults: bool) -> Variant:
	var node := GodotMcpNodeLocator.find(snapshot.root, node_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(snapshot.root, node_path))
	return {
		"scene": snapshot.scene_path,
		"path": GodotMcpNodeLocator.path_of(snapshot.root, node),
		"type": GodotMcpNodeFactory.display_class(node),
		"properties": _context.properties.describe(node, PackedStringArray(names), include_defaults),
	}
