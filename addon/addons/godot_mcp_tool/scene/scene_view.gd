extends RefCounted

var hides_instance_nodes := false

var _scene_root: Node
var _expand_instances: bool


func _init(scene_root: Node, expand_instances: bool = false) -> void:
	_scene_root = scene_root
	_expand_instances = expand_instances


func children_of(node: Node) -> Array[Node]:
	var children: Array[Node] = []
	for child in node.get_children():
		if shows(child):
			children.append(child)
		elif _belongs_to_scene(child):
			hides_instance_nodes = true
	return children


func nodes_under(node: Node) -> Array[Node]:
	var nodes: Array[Node] = [node]
	for child in children_of(node):
		nodes.append_array(nodes_under(child))
	return nodes


func shows(node: Node) -> bool:
	if node == _scene_root:
		return true
	var instance := node.owner
	while instance != null and instance != _scene_root:
		if not _expand_instances and not has_editable_children(instance):
			return false
		instance = instance.owner
	return instance == _scene_root


func has_editable_children(node: Node) -> bool:
	return node != _scene_root and not node.scene_file_path.is_empty() and _scene_root.is_ancestor_of(node) and _scene_root.is_editable_instance(node)


func _belongs_to_scene(node: Node) -> bool:
	var instance := node.owner
	while instance != null and instance != _scene_root:
		instance = instance.owner
	return instance == _scene_root
