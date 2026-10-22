extends RefCounted

const NodeFactory := preload("node_factory.gd")

var node_count := 0
var truncated := false

var _include_unowned_children: bool


func _init(include_unowned_children: bool = false) -> void:
	_include_unowned_children = include_unowned_children


func describe(scene_root: Node, max_depth: int, max_nodes: int) -> Dictionary:
	node_count = 0
	truncated = false
	return _describe_node(scene_root, scene_root, 0, max_depth, max_nodes)


static func traits_of(node: Node, scene_root: Node) -> Dictionary:
	var traits := {"type": NodeFactory.display_class(node)}
	var script := node.get_script() as Script
	if script != null:
		traits["script"] = "built-in" if script.resource_path.contains("::") or script.resource_path.is_empty() else script.resource_path
	var is_instance := node != scene_root and not node.scene_file_path.is_empty()
	if is_instance:
		traits["instance"] = node.scene_file_path
	var groups := visible_groups(node)
	if not groups.is_empty():
		traits["groups"] = groups
	return traits


static func owned_children(node: Node, scene_root: Node) -> Array[Node]:
	var children: Array[Node] = []
	for child in node.get_children():
		if child.owner == scene_root:
			children.append(child)
	return children


func _describe_node(node: Node, scene_root: Node, depth: int, max_depth: int, max_nodes: int) -> Dictionary:
	node_count += 1
	var description := {"name": str(node.name)}
	description.merge(traits_of(node, scene_root))
	var children := node.get_children() if _include_unowned_children else owned_children(node, scene_root)
	if children.is_empty():
		return description
	description["child_count"] = children.size()
	if depth >= max_depth or node_count >= max_nodes:
		truncated = true
		return description
	var child_descriptions: Array = []
	for child in children:
		if node_count >= max_nodes:
			truncated = true
			break
		child_descriptions.append(_describe_node(child, scene_root, depth + 1, max_depth, max_nodes))
	description["children"] = child_descriptions
	return description


static func visible_groups(node: Node) -> Array:
	var groups: Array = []
	for group in node.get_groups():
		if not str(group).begins_with("_"):
			groups.append(str(group))
	return groups
