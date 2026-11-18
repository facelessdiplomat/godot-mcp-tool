extends RefCounted

const GodotMcpChangeSet := preload("change_set.gd")
const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")
const GodotMcpNodeLocator := preload("node_locator.gd")

const INHERITED_CONNECTION_FLAG := 32
const DUPLICATE_FROM_EDITOR_FLAG := 32
const EDITOR_DUPLICATE_FLAGS := Node.DUPLICATE_SIGNALS | Node.DUPLICATE_GROUPS | Node.DUPLICATE_SCRIPTS | Node.DUPLICATE_USE_INSTANTIATION | DUPLICATE_FROM_EDITOR_FLAG
const SCENE_ROOT_PATH := "."
const RELATIVE_PREFIX := "./"


static func turn_on_editable_children_for(node: Node, scene_root: Node, changes: GodotMcpChangeSet) -> Array:
	var instance_paths: Array = []
	for instance in _instances_without_editable_children_around(node, scene_root):
		changes.add_do_call(scene_root, &"set_editable_instance", [instance, true])
		changes.add_do_call(instance, &"set_scene_instance_load_placeholder", [false])
		changes.add_undo_call(scene_root, &"set_editable_instance", [instance, false])
		changes.add_undo_call(instance, &"set_scene_instance_load_placeholder", [instance.get_scene_instance_load_placeholder()])
		instance_paths.append(GodotMcpNodeLocator.path_of(scene_root, instance))
	return instance_paths


static func refusal_for_part_of(node: Node, scene_root: Node, kept_there: String) -> GodotMcpCommandError:
	if node == scene_root or node.owner == null or node.owner == scene_root:
		return null
	var scene_path := node.owner.scene_file_path
	return GodotMcpCommandError.new(
		GodotMcpJsonRpc.INVALID_PARAMS,
		"\"%s\" is part of the instanced scene %s, which keeps its %s" % [GodotMcpNodeLocator.path_of(scene_root, node), scene_path, kept_there],
		"Change it in that scene with scene: \"%s\"; every instance of the scene gets the change." % scene_path,
	)


static func is_inherited(connection: Dictionary) -> bool:
	return int(connection["flags"]) & INHERITED_CONNECTION_FLAG != 0


static func scene_making_connection(source: Node, signal_name: String, target: Node, method: String, scene_root: Node) -> String:
	for candidate in _scene_roots_that_could_connect(source, scene_root):
		if not ResourceLoader.exists(candidate.scene_file_path):
			continue
		var state := (load(candidate.scene_file_path) as PackedScene).get_state()
		if candidate == scene_root:
			state = state.get_base_scene_state()
		while state != null:
			if _state_connects(state, _relative(candidate.get_path_to(source)), signal_name, _relative(candidate.get_path_to(target)), method):
				return state.get_path()
			state = state.get_base_scene_state()
	return ""


static func _instances_without_editable_children_around(node: Node, scene_root: Node) -> Array[Node]:
	var instances: Array[Node] = []
	var instance := node.owner
	while instance != null and instance != scene_root:
		if not scene_root.is_editable_instance(instance):
			instances.push_front(instance)
		instance = instance.owner
	return instances


static func _scene_roots_that_could_connect(source: Node, scene_root: Node) -> Array[Node]:
	var roots: Array[Node] = []
	if source != scene_root and not source.scene_file_path.is_empty():
		roots.append(source)
	var instance := source.owner
	while instance != null and instance != scene_root:
		roots.append(instance)
		instance = instance.owner
	roots.append(scene_root)
	return roots


static func _state_connects(state: SceneState, source_path: String, signal_name: String, target_path: String, method: String) -> bool:
	for index in state.get_connection_count():
		if _relative(state.get_connection_source(index)) != source_path or _relative(state.get_connection_target(index)) != target_path:
			continue
		if str(state.get_connection_signal(index)) == signal_name and str(state.get_connection_method(index)) == method:
			return true
	return false


static func _relative(path: NodePath) -> String:
	var text := str(path)
	return text if text == SCENE_ROOT_PATH else text.trim_prefix(RELATIVE_PREFIX)
