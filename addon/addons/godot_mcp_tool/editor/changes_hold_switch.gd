extends RefCounted

const ITEM_TEXT := "Hold Changes"

var _held := false


func is_held() -> bool:
	return _held


func set_held(held: bool) -> void:
	if held == _held:
		return
	_held = held
	if held:
		print("Godot MCP Tool: changes are held. The agent can read the project and the running game, but cannot change them or start the game until you turn Hold Changes off.")
	else:
		print("Godot MCP Tool: changes are no longer held.")
