extends "res://addons/godot_mcp_tool/scene/scene_access.gd"

var edited_root: Node
var opened_paths := PackedStringArray()
var saved_paths := PackedStringArray()
var unsaved_roots: Array[Node] = []
var closed_paths := PackedStringArray()
var selected_nodes: Array[Node] = []
var selected_file := ""


func edited_scene_root() -> Node:
	return edited_root


func open_scene_roots() -> Array[Node]:
	var roots: Array[Node] = []
	if edited_root != null:
		roots.append(edited_root)
	return roots


func open_scene(scene_path: String) -> Error:
	var packed_scene := load(scene_path) as PackedScene
	if packed_scene == null:
		return ERR_FILE_NOT_FOUND
	if edited_root != null:
		edited_root.free()
	edited_root = packed_scene.instantiate(PackedScene.GEN_EDIT_STATE_MAIN)
	opened_paths.append(scene_path)
	return OK


func save_scene(scene_root: Node) -> Error:
	saved_paths.append(scene_root.scene_file_path)
	return OK


func is_scene_unsaved(scene_root: Node) -> bool:
	return scene_root in unsaved_roots


func close_scene(scene_root: Node) -> Error:
	closed_paths.append(scene_root.scene_file_path)
	if scene_root == edited_root:
		edited_root.free()
		edited_root = null
	return OK


func select_nodes(nodes: Array[Node]) -> void:
	selected_nodes = nodes


func select_file(file_path: String) -> void:
	selected_file = file_path


func release() -> void:
	if edited_root != null:
		edited_root.free()
		edited_root = null
