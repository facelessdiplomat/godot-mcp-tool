extends "editor_history_step.gd"


func _next_name(scene_root: Node) -> String:
	return _context.history.next_redo_name(scene_root)


func _step(scene_root: Node) -> bool:
	return _context.history.redo_in(scene_root)


func _stepped_key() -> String:
	return "redone"
