extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const InputMapGetCommand := preload("res://addons/godot_mcp_tool/commands/input/input_map_get_command.gd")
const InputMapSetCommand := preload("res://addons/godot_mcp_tool/commands/input/input_map_set_command.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")

const MOVE_ACTION := "mcp_test_move_forward"
const JUMP_ACTION := "mcp_test_jump"

var _save_calls := 0


func before_each() -> void:
	_save_calls = 0


func after_each() -> void:
	for action_name in [MOVE_ACTION, JUMP_ACTION]:
		if ProjectSettings.has_setting("input/" + action_name):
			ProjectSettings.clear("input/" + action_name)


func _set_actions(actions: Dictionary) -> Variant:
	var command := InputMapSetCommand.new(func() -> Error:
		_save_calls += 1
		return OK)
	return await command.execute({"actions": actions})


func _action_names(result: Dictionary) -> Array:
	return (result["actions"] as Array).map(func(action: Dictionary) -> String: return action["name"])


func test_creates_actions_and_saves_once() -> void:
	var result: Dictionary = await _set_actions({MOVE_ACTION: ["W", "Up"], JUMP_ACTION: {"events": ["Space"], "deadzone": 0.3}})
	assert_eq(result["applied"], [MOVE_ACTION, JUMP_ACTION])
	assert_eq(result["previous"], {MOVE_ACTION: null, JUMP_ACTION: null})
	assert_eq(_save_calls, 1)
	var move_setting: Dictionary = ProjectSettings.get_setting("input/" + MOVE_ACTION)
	assert_eq((move_setting["events"] as Array).size(), 2)
	assert_almost_eq(float(move_setting["deadzone"]), 0.2, 0.0001)
	assert_almost_eq(float((ProjectSettings.get_setting("input/" + JUMP_ACTION) as Dictionary)["deadzone"]), 0.3, 0.0001)


func test_replaces_the_events_and_reports_the_previous_ones() -> void:
	await _set_actions({MOVE_ACTION: ["W"]})
	var result: Dictionary = await _set_actions({MOVE_ACTION: ["Up"]})
	assert_eq((((result["previous"] as Dictionary)[MOVE_ACTION] as Array)[0] as Dictionary)["key"], "W")
	var events: Array = (ProjectSettings.get_setting("input/" + MOVE_ACTION) as Dictionary)["events"]
	assert_eq((events[0] as InputEventKey).physical_keycode, KEY_UP)


func test_removes_an_action_given_null() -> void:
	await _set_actions({MOVE_ACTION: ["W"]})
	var result: Dictionary = await _set_actions({MOVE_ACTION: null})
	assert_eq(result["removed"], [MOVE_ACTION])
	assert_false(ProjectSettings.has_setting("input/" + MOVE_ACTION))


func test_rejects_an_unknown_key_and_keeps_the_rest() -> void:
	var result: Dictionary = await _set_actions({MOVE_ACTION: ["W"], JUMP_ACTION: ["Spce"]})
	assert_eq(result["applied"], [MOVE_ACTION])
	assert_eq(((result["rejected"] as Array)[0] as Dictionary)["name"], JUMP_ACTION)
	assert_string_contains(((result["rejected"] as Array)[0] as Dictionary)["reason"], "Space")
	assert_false(ProjectSettings.has_setting("input/" + JUMP_ACTION))


func test_does_not_save_when_nothing_changes() -> void:
	await _set_actions({JUMP_ACTION: ["Spce"]})
	assert_eq(_save_calls, 0)


func test_keeps_the_built_in_actions() -> void:
	var result: Dictionary = await _set_actions({"ui_accept": null})
	assert_eq(result["removed"], [])
	assert_string_contains(((result["rejected"] as Array)[0] as Dictionary)["reason"], "ui_")
	assert_true(ProjectSettings.has_setting("input/ui_accept"))


func test_explains_an_action_name_it_cannot_use() -> void:
	var result: Dictionary = await _set_actions({"move/forward": ["W"]})
	assert_eq(result["applied"], [])
	assert_eq(((result["rejected"] as Array)[0] as Dictionary)["name"], "move/forward")


func test_requires_actions() -> void:
	var error: Variant = await _set_actions({})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_lists_the_actions_of_the_project_without_the_built_in_ones() -> void:
	await _set_actions({MOVE_ACTION: ["W"]})
	var result: Dictionary = await InputMapGetCommand.new().execute({})
	assert_true(MOVE_ACTION in _action_names(result))
	assert_false("ui_accept" in _action_names(result))


func test_lists_named_actions_with_their_events_and_explains_unknown_names() -> void:
	await _set_actions({MOVE_ACTION: ["W", {"type": "joypad_button", "button": "a"}]})
	var result: Dictionary = await InputMapGetCommand.new().execute({"actions": [MOVE_ACTION, "mcp_test_move_forwrd"]})
	var events: Array = ((result["actions"] as Array)[0] as Dictionary)["events"]
	assert_eq(events.map(func(event: Dictionary) -> String: return event["type"]), ["key", "joypad_button"])
	assert_eq(((result["unknown"] as Array)[0] as Dictionary)["name"], "mcp_test_move_forwrd")
	assert_string_contains(((result["unknown"] as Array)[0] as Dictionary)["reason"], MOVE_ACTION)


func test_lists_the_built_in_actions_on_request() -> void:
	var result: Dictionary = await InputMapGetCommand.new().execute({"include_builtin": true})
	assert_true("ui_accept" in _action_names(result))
