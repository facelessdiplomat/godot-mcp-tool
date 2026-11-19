extends "command.gd"

var _is_changes_held: Callable


func _init(is_changes_held: Callable = func() -> bool: return false) -> void:
	_is_changes_held = is_changes_held


func execute(_params: Dictionary) -> Variant:
	return {"pong": true, "changes_held": bool(_is_changes_held.call())}
