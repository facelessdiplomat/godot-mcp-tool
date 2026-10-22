extends RefCounted

var root: Node
var scene_path: String
var is_temporary: bool


func _init(scene_root: Node, path: String, temporary: bool) -> void:
	root = scene_root
	scene_path = path
	is_temporary = temporary


func release() -> void:
	if is_temporary and is_instance_valid(root):
		root.free()
