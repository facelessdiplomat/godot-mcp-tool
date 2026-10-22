extends "converter.gd"


func handles(property: Dictionary) -> bool:
	return property.get("type") == TYPE_OBJECT and property.get("hint") == PROPERTY_HINT_NODE_TYPE


func decode(value: Variant, property: Dictionary, target: Object, _decoder: ValueDecoder) -> DecodeOutcome:
	if value == null:
		return _success(null)
	if not value is String:
		return _failure("expected a node path relative to this node, such as \"../Player\"")
	if not target is Node:
		return _failure("node references can only be set on nodes")
	var referenced_node := (target as Node).get_node_or_null(NodePath(value))
	if referenced_node == null:
		return _failure("node \"%s\" not found relative to %s" % [value, (target as Node).name])
	var expected_type := str(property.get("hint_string", ""))
	if not expected_type.is_empty() and not _is_instance_of(referenced_node, expected_type):
		return _failure("\"%s\" is a %s, but this property needs %s" % [value, _display_class(referenced_node), expected_type])
	return _success(referenced_node)
