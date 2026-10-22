extends RefCounted

const SimilarNames := preload("../util/similar_names.gd")

const MAXIMUM_SUGGESTION_CANDIDATES := 2000


static func find(scene_root: Node, path_text: String) -> Node:
	var relative_path := path_text.strip_edges().trim_prefix("/")
	if relative_path.is_empty() or relative_path == ".":
		return scene_root
	var found := scene_root.get_node_or_null(NodePath(relative_path))
	if found != null:
		return found
	var root_name := str(scene_root.name)
	if relative_path == root_name:
		return scene_root
	if relative_path.begins_with(root_name + "/"):
		return scene_root.get_node_or_null(NodePath(relative_path.trim_prefix(root_name + "/")))
	return null


static func path_of(scene_root: Node, node: Node) -> String:
	return str(scene_root.get_path_to(node))


static func similar_paths(scene_root: Node, path_text: String) -> PackedStringArray:
	var paths: Array = []
	_collect_paths(scene_root, scene_root, paths)
	return SimilarNames.find(path_text, paths)


static func not_found_hint(scene_root: Node, path_text: String) -> String:
	var similar := similar_paths(scene_root, path_text)
	if not similar.is_empty():
		return "Similar: %s." % ", ".join(similar)
	return "Use scene_get_tree to see the node paths of the scene; \".\" is the scene root."


static func _collect_paths(scene_root: Node, node: Node, paths: Array) -> void:
	for child in node.get_children():
		if paths.size() >= MAXIMUM_SUGGESTION_CANDIDATES:
			return
		paths.append(path_of(scene_root, child))
		_collect_paths(scene_root, child, paths)
