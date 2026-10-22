extends "scene_access.gd"


func edited_scene_root() -> Node:
	return EditorInterface.get_edited_scene_root()


func open_scene_roots() -> Array[Node]:
	var roots: Array[Node] = []
	for root in EditorInterface.get_open_scene_roots():
		roots.append(root)
	return roots


func open_scene(scene_path: String) -> Error:
	EditorInterface.open_scene_from_path(scene_path)
	for root in EditorInterface.get_open_scene_roots():
		if root.scene_file_path == scene_path:
			return OK
	return ERR_CANT_OPEN


func save_scene(scene_root: Node) -> Error:
	if EditorInterface.get_edited_scene_root() != scene_root:
		EditorInterface.open_scene_from_path(scene_root.scene_file_path)
	return EditorInterface.save_scene()


func save_all_scenes() -> Error:
	EditorInterface.save_all_scenes()
	return OK


func is_scene_unsaved(scene_root: Node) -> bool:
	if not EditorInterface.has_method(&"get_unsaved_scenes"):
		return false
	return scene_root.scene_file_path in EditorInterface.call(&"get_unsaved_scenes")


func register_new_file(file_path: String) -> void:
	EditorInterface.get_resource_filesystem().update_file(file_path)


func close_scene(scene_root: Node) -> Error:
	var previous_root := EditorInterface.get_edited_scene_root()
	if previous_root != scene_root:
		EditorInterface.open_scene_from_path(scene_root.scene_file_path)
	var close_error := EditorInterface.close_scene()
	if previous_root != null and previous_root != scene_root and is_instance_valid(previous_root):
		EditorInterface.open_scene_from_path(previous_root.scene_file_path)
	return close_error


func select_nodes(nodes: Array[Node]) -> void:
	var selection := EditorInterface.get_selection()
	selection.clear()
	for node in nodes:
		selection.add_node(node)


func select_file(file_path: String) -> void:
	EditorInterface.select_file(file_path)
