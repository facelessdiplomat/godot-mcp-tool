extends RefCounted

const WILDCARDS := ["*", "?"]

var _name_pattern: String
var _type_name: String
var _group: String
var _script_path: String


func _init(name_pattern: String, type_name: String, group: String, script_path: String) -> void:
	_name_pattern = name_pattern
	_type_name = type_name
	_group = group
	_script_path = script_path


func matches(node: Node) -> bool:
	return _matches_name(node) and _matches_type(node) and _matches_group(node) and _matches_script(node)


func _matches_name(node: Node) -> bool:
	if _name_pattern.is_empty():
		return true
	var node_name := str(node.name)
	if WILDCARDS.any(func(wildcard: String) -> bool: return _name_pattern.contains(wildcard)):
		return node_name.matchn(_name_pattern)
	return node_name.containsn(_name_pattern)


func _matches_type(node: Node) -> bool:
	if _type_name.is_empty() or node.is_class(_type_name):
		return true
	var script := node.get_script() as Script
	while script != null:
		if script.get_global_name() == _type_name:
			return true
		script = script.get_base_script()
	return false


func _matches_group(node: Node) -> bool:
	return _group.is_empty() or node.is_in_group(_group)


func _matches_script(node: Node) -> bool:
	if _script_path.is_empty():
		return true
	var script := node.get_script() as Script
	if script == null:
		return false
	return script.resource_path == _script_path or script.resource_path.ends_with("/" + _script_path)
