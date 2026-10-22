extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")
const SceneResolver := preload("../../scene/scene_resolver.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var node_paths: Variant = Params.text_list(params, "nodes")
	var file_path: Variant = Params.text(params, "file")
	var scene_path: Variant = Params.text(params, "scene")
	for value in [node_paths, file_path, scene_path]:
		if value is CommandError:
			return value
	var selects_nodes := not (node_paths as Array).is_empty()
	var selects_file := not (file_path as String).is_empty()
	if selects_nodes == selects_file:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "Pass either nodes or file", "Example: {\"nodes\": [\"Player\"]} or {\"file\": \"res://materials/ice.tres\"}")
	if selects_file:
		return _select_file(file_path)
	return _select_nodes(node_paths, scene_path)


func _select_file(file_path: String) -> Variant:
	var exists := FileAccess.file_exists(file_path) or DirAccess.dir_exists_absolute(file_path) or ResourceLoader.exists(file_path)
	if not file_path.begins_with("res://") or not exists:
		return CommandError.new(JsonRpc.NOT_FOUND, "%s does not exist" % file_path, "File paths look like res://materials/ice.tres.")
	_context.scenes.access.select_file(file_path)
	return {"file": file_path}


func _select_nodes(node_paths: Array, scene_path: String) -> Variant:
	var edited: Variant = _edited_scene(scene_path)
	if edited is CommandError:
		return edited
	var scene_root := edited as Node
	var nodes: Array[Node] = []
	for node_path in node_paths:
		var node := NodeLocator.find(scene_root, node_path)
		if node == null:
			return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, NodeLocator.not_found_hint(scene_root, node_path))
		nodes.append(node)
	_context.scenes.access.select_nodes(nodes)
	return {"scene": scene_root.scene_file_path, "nodes": nodes.map(func(node: Node) -> String: return NodeLocator.path_of(scene_root, node))}


func _edited_scene(scene_path: String) -> Variant:
	var access := _context.scenes.access
	var edited_root := access.edited_scene_root()
	if scene_path.is_empty():
		return edited_root if edited_root != null else SceneResolver.no_scene_error()
	if edited_root != null and edited_root.scene_file_path == scene_path:
		return edited_root
	var path_error := SceneResolver.validate_scene_path(scene_path)
	if path_error != null:
		return path_error
	if not ResourceLoader.exists(scene_path):
		return SceneResolver.missing_scene_error(scene_path)
	var open_error := access.open_scene(scene_path)
	if open_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not open %s: %s" % [scene_path, error_string(open_error)])
	return access.edited_scene_root()
