extends RefCounted


func edited_scene_root() -> Node:
	return null


func open_scene_roots() -> Array[Node]:
	return []


func open_scene(_scene_path: String) -> Error:
	return ERR_UNAVAILABLE


func save_scene(_scene_root: Node) -> Error:
	return ERR_UNAVAILABLE


func save_all_scenes() -> Error:
	return ERR_UNAVAILABLE


func is_scene_unsaved(_scene_root: Node) -> bool:
	return false


func register_new_file(_file_path: String) -> void:
	pass


func close_scene(_scene_root: Node) -> Error:
	return ERR_UNAVAILABLE


func reload_scene(_scene_path: String) -> void:
	pass


func select_nodes(_nodes: Array[Node]) -> void:
	pass


func select_file(_file_path: String) -> void:
	pass
