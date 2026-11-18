extends "scene_edit.gd"

const GodotMcpSceneResolver := preload("../scene_resolver.gd")
const GodotMcpSceneView := preload("../scene_view.gd")

var _scene_root: Node
var _instance: Node
var _file := ""
var _saved_node_count := 0
var _written := false


func prepare(scene_root: Node, params: Dictionary) -> GodotMcpCommandError:
	var node_path: Variant = GodotMcpParams.required_text(params, "path", "\"Enemy\"")
	var file: Variant = GodotMcpParams.required_text(params, "file", "\"res://enemies/enemy.tscn\"")
	for value in [node_path, file]:
		if value is GodotMcpCommandError:
			return value
	var node := GodotMcpNodeLocator.find(scene_root, node_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(scene_root, node_path))
	if node == scene_root:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "The scene root is the whole scene already", "Pass a node below the root, such as \"Enemy\".")
	if is_inside_instance(node, scene_root):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" belongs to an instanced scene" % node_path, "Save a node that belongs to this scene, or change the instanced scene itself.")
	var path_problem := GodotMcpSceneResolver.validate_scene_path(file)
	if path_problem != null:
		return path_problem
	if FileAccess.file_exists(file) or ResourceLoader.exists(file):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s already exists" % file, "Choose a new file name; the branch is never saved over another scene.")
	var write_problem := _write_branch(node, scene_root, file)
	if write_problem != null:
		return write_problem
	var scene := ResourceLoader.load(file, "PackedScene", ResourceLoader.CACHE_MODE_REPLACE) as PackedScene
	if scene == null or not scene.can_instantiate():
		discard_outside_changes()
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "%s was written but cannot be instanced" % file)
	_scene_root = scene_root
	_instance = scene.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
	_place_like(node)
	_keep_connections_of(node)
	action_name = "MCP: Save %s as %s" % [node.name, file]
	var parent := node.get_parent()
	var index := node.get_index()
	changes.add_do_call(parent, &"remove_child", [node])
	changes.add_do_call(parent, &"add_child", [_instance, true])
	changes.add_do_call(parent, &"move_child", [_instance, index])
	changes.add_do_call(_instance, &"set_owner", [scene_root])
	changes.add_undo_call(parent, &"remove_child", [_instance])
	changes.add_undo_call(parent, &"add_child", [node, true])
	changes.add_undo_call(parent, &"move_child", [node, index])
	for owned in owned_subtree(node, scene_root):
		changes.add_undo_call(owned, &"set_owner", [scene_root])
	changes.add_do_reference(_instance)
	changes.add_undo_reference(node)
	return null


func finish() -> Dictionary:
	return {
		"path": GodotMcpNodeLocator.path_of(_scene_root, _instance),
		"file": _file,
		"type": GodotMcpNodeFactory.display_class(_instance),
		"node_count": _saved_node_count,
	}


func discard_outside_changes() -> void:
	if not _written:
		return
	DirAccess.remove_absolute(ProjectSettings.globalize_path(_file))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(_file + ".uid"))
	_context.scenes.access.register_new_file(_file)
	_written = false


func _write_branch(node: Node, scene_root: Node, file: String) -> GodotMcpCommandError:
	var copy := node.duplicate(GodotMcpInstancedScenes.EDITOR_DUPLICATE_FLAGS)
	for original in owned_subtree(node, scene_root):
		if original != node:
			copy.get_node(node.get_path_to(original)).owner = copy
	var view := GodotMcpSceneView.new(scene_root)
	for original in view.nodes_under(node):
		if original != node and view.has_editable_children(original):
			copy.set_editable_instance(copy.get_node(node.get_path_to(original)), true)
	copy.set_unique_name_in_owner(false)
	if copy is Node3D:
		(copy as Node3D).position = Vector3.ZERO
	elif copy is Node2D:
		(copy as Node2D).position = Vector2.ZERO
	_saved_node_count = _count_owned(copy, copy)
	var packed := PackedScene.new()
	var pack_error := packed.pack(copy)
	copy.free()
	if pack_error != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not pack the branch: %s" % error_string(pack_error), "Check that the scenes it instances still exist.")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(file.get_base_dir()))
	var save_error := ResourceSaver.save(packed, file)
	if save_error != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not save %s: %s" % [file, error_string(save_error)])
	_file = file
	_written = true
	_context.scenes.access.register_new_file(file)
	return null


func _place_like(node: Node) -> void:
	_instance.set_unique_name_in_owner(node.is_unique_name_in_owner())
	if node is Node3D and _instance is Node3D:
		(_instance as Node3D).position = (node as Node3D).position
		(_instance as Node3D).rotation = (node as Node3D).rotation
		(_instance as Node3D).scale = (node as Node3D).scale
	elif node is Node2D and _instance is Node2D:
		(_instance as Node2D).position = (node as Node2D).position
		(_instance as Node2D).rotation = (node as Node2D).rotation
		(_instance as Node2D).scale = (node as Node2D).scale


func _keep_connections_of(node: Node) -> void:
	for description in node.get_signal_list():
		var signal_name: StringName = description["name"]
		var present: Array = _instance.get_signal_connection_list(signal_name).map(func(connection: Dictionary) -> StringName: return (connection["callable"] as Callable).get_method())
		for connection in node.get_signal_connection_list(signal_name):
			var callable: Callable = connection["callable"]
			if int(connection["flags"]) & CONNECT_PERSIST and not callable.get_method() in present:
				_instance.connect(signal_name, callable, int(connection["flags"]))


static func _count_owned(node: Node, scene_root: Node) -> int:
	var count := 1
	for child in node.get_children():
		if child.owner == scene_root:
			count += _count_owned(child, scene_root)
	return count
