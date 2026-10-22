extends GutTest

const AnimationDeleteCommand := preload("res://addons/godot_mcp_tool/commands/animation/animation_delete_command.gd")
const AnimationGetCommand := preload("res://addons/godot_mcp_tool/commands/animation/animation_get_command.gd")
const AnimationSetCommand := preload("res://addons/godot_mcp_tool/commands/animation/animation_set_command.gd")
const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _level: Node3D
var _door: Node3D
var _lamp: OmniLight3D
var _player: AnimationPlayer


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), FakeScriptEditorAccess.new())
	_level = Node3D.new()
	_level.name = "Level"
	_level.scene_file_path = "res://level.tscn"
	add_child(_level)
	_scenes.edited_root = _level
	_door = _add(Node3D.new(), "Door")
	_door.position = Vector3(0, 1, 0)
	_lamp = _add(OmniLight3D.new(), "Lamp")
	_player = _add(AnimationPlayer.new(), "AnimationPlayer")


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _add(node: Node, name: String) -> Node:
	node.name = name
	_level.add_child(node)
	node.owner = _level
	return node


func _set_animation(params: Dictionary) -> Variant:
	return await AnimationSetCommand.new(_context).execute(params)


func _door_rising(keys := [{"time": 0, "value": [0, 1, 0]}, {"time": 1, "value": [0, 4, 0]}]) -> Dictionary:
	return {"player": "AnimationPlayer", "name": "open", "length": 1.0, "tracks": [{"path": "Door:position", "keys": keys}]}


func _rejected_paths(result: Dictionary) -> Array:
	return (result["rejected"] as Array).map(func(rejection: Dictionary) -> String: return rejection["path"])


func test_creates_an_animation_with_a_value_track_as_one_undo_step() -> void:
	var result: Dictionary = await _set_animation(_door_rising())
	assert_eq(result["scene"], "res://level.tscn")
	assert_eq(result["player"], "AnimationPlayer")
	assert_eq(result["name"], "open")
	assert_eq(result["created"], true)
	assert_eq(result["length"], 1.0)
	assert_eq(result["loop"], "none")
	assert_eq(result["tracks"], [{"path": "Door:position", "keys": 2, "interpolation": "linear", "update": "continuous", "from": "Vector3(0, 1, 0)", "to": "Vector3(0, 4, 0)"}])
	assert_eq(result["rejected"], [])
	assert_eq(_history.last_action_name(), "MCP: Set animation open")
	_player.play("open")
	_player.seek(0.5, true)
	assert_almost_eq(_door.position, Vector3(0, 2.5, 0), Vector3.ONE * 0.001)
	_player.stop()
	assert_true(_history.undo())
	assert_false(_player.has_animation("open"))
	assert_true(_history.redo())
	assert_true(_player.has_animation("open"))


func test_replaces_an_existing_animation_and_undo_brings_the_old_one_back() -> void:
	await _set_animation(_door_rising())
	var result: Dictionary = await _set_animation(_door_rising([{"time": 0, "value": [0, 1, 0]}, {"time": 1, "value": [0, 9, 0]}]))
	assert_eq(result["created"], false)
	assert_eq(_player.get_animation("open").track_get_key_value(0, 1), Vector3(0, 9, 0))
	assert_true(_history.undo())
	assert_eq(_player.get_animation("open").track_get_key_value(0, 1), Vector3(0, 4, 0))


func test_updates_values_that_cannot_blend_in_steps() -> void:
	var result: Dictionary = await _set_animation({"player": "AnimationPlayer", "name": "blink", "tracks": [{"path": "Lamp:visible", "keys": [{"time": 0, "value": true}, {"time": 0.5, "value": false}]}]})
	assert_eq(((result["tracks"] as Array)[0] as Dictionary)["update"], "discrete")
	assert_eq(result["length"], 0.5)
	assert_eq(_player.get_animation("blink").value_track_get_update_mode(0), Animation.UPDATE_DISCRETE)


func test_takes_interpolation_update_and_loop_by_name() -> void:
	await _set_animation({
		"player": "AnimationPlayer",
		"name": "spin",
		"length": 2.0,
		"loop": "pingpong",
		"tracks": [{"path": "Door:rotation:y", "interpolation": "linear_angle", "update": "capture", "keys": [{"time": 0, "value": 0}, {"time": 2, "value": PI}]}],
	})
	var spin := _player.get_animation("spin")
	assert_eq(spin.loop_mode, Animation.LOOP_PINGPONG)
	assert_eq(spin.track_get_path(0), NodePath("Door:rotation:y"))
	assert_eq(spin.track_get_interpolation_type(0), Animation.INTERPOLATION_LINEAR_ANGLE)
	assert_eq(spin.value_track_get_update_mode(0), Animation.UPDATE_CAPTURE)
	assert_almost_eq(spin.track_get_key_value(0, 1), PI, 0.0001)


func test_rejects_the_tracks_it_cannot_use_and_keeps_the_rest() -> void:
	var result: Dictionary = await _set_animation({
		"player": "AnimationPlayer",
		"name": "open",
		"length": 1.0,
		"tracks": [
			{"path": "Gate:position", "keys": [{"time": 0, "value": [0, 0, 0]}]},
			{"path": "Door:positon", "keys": [{"time": 0, "value": [0, 0, 0]}]},
			{"path": "Lamp:light_energy", "keys": [{"time": 0, "value": "bright"}]},
			{"path": "Lamp:light_color", "keys": [{"time": 2, "value": "red"}]},
			{"path": "Door", "keys": [{"time": 0, "value": 1}]},
			{"path": "Door:position", "keys": [{"time": 0, "value": [0, 1, 0]}, {"time": 1, "value": [0, 4, 0]}]},
			{"path": "Door:position", "keys": [{"time": 0, "value": [0, 2, 0]}]},
		],
	})
	assert_eq(_rejected_paths(result), ["Gate:position", "Door:positon", "Lamp:light_energy", "Lamp:light_color", "Door", "Door:position"])
	var reasons := (result["rejected"] as Array).map(func(rejection: Dictionary) -> String: return rejection["reason"])
	assert_string_contains(reasons[0], "no node Gate")
	assert_string_contains(reasons[1], "position")
	assert_string_contains(reasons[2], "light_energy")
	assert_string_contains(reasons[3], "after the end")
	assert_string_contains(reasons[4], "Node:property")
	assert_string_contains(reasons[5], "twice")
	assert_eq((result["tracks"] as Array).size(), 1)
	assert_eq(_player.get_animation("open").get_track_count(), 1)


func test_explains_what_it_needs() -> void:
	var missing_player: CommandError = await _set_animation({"player": "Gate", "name": "open", "tracks": _door_rising()["tracks"]})
	assert_eq(missing_player.code, JsonRpc.NOT_FOUND)
	var not_a_player: CommandError = await _set_animation({"player": "Door", "name": "open", "tracks": _door_rising()["tracks"]})
	assert_eq(not_a_player.code, JsonRpc.INVALID_PARAMS)
	assert_eq(not_a_player.message, "Door is a Node3D, not an AnimationPlayer")
	var bad_name: CommandError = await _set_animation({"player": "AnimationPlayer", "name": "open:fast", "tracks": _door_rising()["tracks"]})
	assert_eq(bad_name.code, JsonRpc.INVALID_PARAMS)
	var no_tracks: CommandError = await _set_animation({"player": "AnimationPlayer", "name": "open", "tracks": []})
	assert_eq(no_tracks.code, JsonRpc.INVALID_PARAMS)
	var nothing_usable: Dictionary = await _set_animation({"player": "AnimationPlayer", "name": "open", "tracks": [{"path": "Gate:position", "keys": [{"time": 0, "value": [0, 0, 0]}]}]})
	assert_eq(nothing_usable["tracks"], [])
	assert_false(_player.has_animation("open"))


func test_reads_the_animations_of_a_player_and_the_keys_of_one() -> void:
	await _set_animation(_door_rising())
	var listed: Dictionary = await AnimationGetCommand.new(_context).execute({"player": "AnimationPlayer"})
	assert_eq(listed["player"], "AnimationPlayer")
	assert_eq(listed["root_node"], "..")
	assert_eq(listed["autoplay"], "")
	assert_eq(listed["animations"], [{"name": "open", "length": 1.0, "loop": "none", "tracks": 1}])
	var detailed: Dictionary = await AnimationGetCommand.new(_context).execute({"player": "AnimationPlayer", "name": "open"})
	assert_eq(detailed["animation"], {
		"name": "open",
		"length": 1.0,
		"loop": "none",
		"tracks": [{"path": "Door:position", "type": "value", "interpolation": "linear", "update": "continuous", "key_count": 2, "keys": [{"time": 0.0, "value": "Vector3(0, 1, 0)"}, {"time": 1.0, "value": "Vector3(0, 4, 0)"}]}],
	})
	var unknown: CommandError = await AnimationGetCommand.new(_context).execute({"player": "AnimationPlayer", "name": "close"})
	assert_eq(unknown.code, JsonRpc.NOT_FOUND)
	assert_string_contains(unknown.hint, "open")


func test_deletes_an_animation_as_one_undo_step() -> void:
	await _set_animation(_door_rising())
	var result: Dictionary = await AnimationDeleteCommand.new(_context).execute({"player": "AnimationPlayer", "name": "open"})
	assert_eq(result, {"scene": "res://level.tscn", "player": "AnimationPlayer", "name": "open"})
	assert_false(_player.has_animation("open"))
	assert_eq(_history.last_action_name(), "MCP: Delete animation open")
	assert_true(_history.undo())
	assert_true(_player.has_animation("open"))
	var missing: CommandError = await AnimationDeleteCommand.new(_context).execute({"player": "AnimationPlayer", "name": "close"})
	assert_eq(missing.code, JsonRpc.NOT_FOUND)
