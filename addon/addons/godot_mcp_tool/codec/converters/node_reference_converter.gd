extends "converter.gd"


func handles(property: Dictionary) -> bool:
	return property.get("type") == TYPE_NODE_PATH or (property.get("type") == TYPE_OBJECT and property.get("hint") == PROPERTY_HINT_NODE_TYPE)


func decode(value: Variant, property: Dictionary, target: Object, _decoder: GodotMcpValueDecoder) -> GodotMcpDecodeOutcome:
	if property.get("type") == TYPE_NODE_PATH:
		return _decode_node_path(value, target)
	if value == null:
		return _success(null)
	if not value is String:
		return _failure("expected a node path relative to this node, such as \"../Player\", or to the scene root, such as \"Player\"")
	if not target is Node:
		return _failure("node references can only be set on nodes")
	var target_node := target as Node
	var scene_root := target_node.owner if target_node.owner != null else target_node
	var referenced_node := target_node.get_node_or_null(NodePath(value))
	if referenced_node == null:
		referenced_node = scene_root.get_node_or_null(NodePath(value))
	if referenced_node == null:
		return _failure("node \"%s\" was found neither relative to %s nor from the scene root %s" % [value, target_node.name, scene_root.name])
	var expected_type := str(property.get("hint_string", ""))
	if not expected_type.is_empty() and not _is_instance_of(referenced_node, expected_type):
		return _failure("\"%s\" is a %s, but this property needs %s" % [value, _display_class(referenced_node), expected_type])
	return _success(referenced_node)


func _decode_node_path(value: Variant, target: Object) -> GodotMcpDecodeOutcome:
	if not (value is String or value is NodePath):
		return _failure("expected a node path such as \"Player/Mesh\", relative to this node or to the scene root")
	var path := NodePath(value)
	if not target is Node or path.is_empty() or path.is_absolute():
		return _success(path)
	var target_node := target as Node
	var node_part := NodePath(path.get_concatenated_names())
	if target_node.get_node_or_null(node_part) != null:
		return _success(path)
	var scene_root := target_node.owner if target_node.owner != null else target_node
	var from_root := scene_root.get_node_or_null(node_part)
	if from_root == null:
		return _success(path)
	var relative := str(target_node.get_path_to(from_root))
	var subnames := path.get_concatenated_subnames()
	return _success(NodePath(relative if subnames.is_empty() else "%s:%s" % [relative, subnames]))
