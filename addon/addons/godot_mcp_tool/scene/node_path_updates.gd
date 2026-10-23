extends RefCounted

const UNIQUE_NAME_PREFIX := "%"


static func plan(scene_root: Node, moved: Node, new_parent: Node, new_name: String) -> Array[Dictionary]:
	var old_location := _names_from_root(scene_root, moved)
	var new_location := _names_from_root(scene_root, new_parent)
	new_location.append(new_name)
	var updates: Array[Dictionary] = []
	for holder in _saved_nodes(scene_root):
		for property in holder.get_property_list():
			if property["type"] != TYPE_NODE_PATH or not int(property["usage"]) & PROPERTY_USAGE_STORAGE:
				continue
			var path: NodePath = holder.get(property["name"])
			if path.is_empty() or path.is_absolute() or str(path).begins_with(UNIQUE_NAME_PREFIX):
				continue
			var target := holder.get_node_or_null(NodePath(path.get_concatenated_names()))
			if target == null or not (target == scene_root or scene_root.is_ancestor_of(target)):
				continue
			var holder_names := _names_from_root(scene_root, holder)
			var target_names := _names_from_root(scene_root, target)
			var holder_names_after := _relocated(holder_names, old_location, new_location)
			var target_names_after := _relocated(target_names, old_location, new_location)
			if holder_names_after == holder_names and target_names_after == target_names:
				continue
			var new_path := _relative_path(holder_names_after, target_names_after, path)
			if new_path == path:
				continue
			updates.append({"node": holder, "property": StringName(property["name"]), "old_path": path, "new_path": new_path})
	return updates


static func _saved_nodes(scene_root: Node) -> Array[Node]:
	var nodes: Array[Node] = [scene_root]
	for descendant in scene_root.find_children("*", "", true, false):
		if descendant.owner == scene_root:
			nodes.append(descendant)
	return nodes


static func _names_from_root(scene_root: Node, node: Node) -> PackedStringArray:
	var names := PackedStringArray()
	var current := node
	while current != null and current != scene_root:
		names.insert(0, str(current.name))
		current = current.get_parent()
	return names


static func _relocated(names: PackedStringArray, old_location: PackedStringArray, new_location: PackedStringArray) -> PackedStringArray:
	if names.size() < old_location.size() or names.slice(0, old_location.size()) != old_location:
		return names
	var relocated := new_location.duplicate()
	relocated.append_array(names.slice(old_location.size()))
	return relocated


static func _relative_path(from_names: PackedStringArray, to_names: PackedStringArray, original: NodePath) -> NodePath:
	var shared := 0
	while shared < mini(from_names.size(), to_names.size()) and from_names[shared] == to_names[shared]:
		shared += 1
	var steps := PackedStringArray()
	for step in from_names.size() - shared:
		steps.append("..")
	steps.append_array(to_names.slice(shared))
	var text := "/".join(steps) if not steps.is_empty() else "."
	if original.get_subname_count() > 0:
		text += ":" + original.get_concatenated_subnames()
	return NodePath(text)
