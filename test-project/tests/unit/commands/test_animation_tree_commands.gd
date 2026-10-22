extends GutTest

const AnimationTreeGetCommand := preload("res://addons/godot_mcp_tool/commands/animation/animation_tree_get_command.gd")
const AnimationTreeSetCommand := preload("res://addons/godot_mcp_tool/commands/animation/animation_tree_set_command.gd")
const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const TREE := "Character/AnimationTree"
const PLAYER := "Character/AnimationPlayer"

var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _level: Node3D
var _tree: AnimationTree


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), FakeScriptEditorAccess.new())
	_level = Node3D.new()
	_level.name = "Level"
	_level.scene_file_path = "res://level.tscn"
	add_child(_level)
	_scenes.edited_root = _level
	var character: Node3D = _add(Node3D.new(), "Character", _level)
	var player: AnimationPlayer = _add(AnimationPlayer.new(), "AnimationPlayer", character)
	var library := AnimationLibrary.new()
	for animation_name in ["idle", "walk", "jump"]:
		var animation := Animation.new()
		animation.length = 1.0
		animation.loop_mode = Animation.LOOP_LINEAR
		library.add_animation(animation_name, animation)
	player.add_animation_library("", library)
	_tree = _add(AnimationTree.new(), "AnimationTree", character)


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _add(node: Node, name: String, parent: Node) -> Node:
	node.name = name
	parent.add_child(node)
	node.owner = _level
	return node


func _set_up(params: Dictionary) -> Variant:
	return await AnimationTreeSetCommand.new(_context).execute(params)


func _walking_machine() -> Dictionary:
	return {
		"tree": TREE,
		"player": PLAYER,
		"states": [{"name": "idle", "animation": "idle"}, {"name": "walk", "animation": "walk"}],
		"transitions": [
			{"from": "Start", "to": "idle"},
			{"from": "idle", "to": "walk", "condition": "moving", "xfade": 0.2},
			{"from": "walk", "to": "idle", "condition": "stopped", "xfade": 0.2},
		],
	}


func _current_state() -> String:
	return str((_tree.get("parameters/playback") as AnimationNodeStateMachinePlayback).get_current_node())


func test_builds_a_state_machine_as_the_tree_root_in_one_undo_step() -> void:
	var result: Dictionary = await _set_up(_walking_machine())
	assert_eq(result["scene"], "res://level.tscn")
	assert_eq(result["tree"], TREE)
	assert_eq(result["player"], PLAYER)
	assert_eq(result["states"], [{"name": "idle", "animation": "idle"}, {"name": "walk", "animation": "walk"}])
	assert_eq(result["transitions"], [
		{"from": "Start", "to": "idle", "advance": "auto", "switch": "immediate", "xfade": 0.0},
		{"from": "idle", "to": "walk", "advance": "auto", "switch": "immediate", "xfade": 0.2, "condition": "moving"},
		{"from": "walk", "to": "idle", "advance": "auto", "switch": "immediate", "xfade": 0.2, "condition": "stopped"},
	])
	assert_eq(result["rejected"], [])
	assert_eq(result["warnings"], [])
	assert_eq(_tree.anim_player, NodePath("../AnimationPlayer"))
	assert_eq(_history.last_action_name(), "MCP: Set up the state machine of AnimationTree")
	_tree.active = true
	_tree.advance(0.1)
	assert_eq(_current_state(), "idle")
	_tree.set("parameters/conditions/moving", true)
	_tree.advance(0.1)
	_tree.advance(0.1)
	assert_eq(_current_state(), "walk")
	_tree.active = false
	assert_true(_history.undo())
	assert_null(_tree.tree_root)
	assert_eq(_tree.anim_player, NodePath(""))
	assert_true(_history.redo())
	assert_true(_tree.tree_root is AnimationNodeStateMachine)


func test_advances_by_itself_only_with_a_condition_an_expression_or_from_start() -> void:
	var machine := _walking_machine()
	machine["states"].append({"name": "jump", "animation": "jump"})
	machine["transitions"] = [
		{"from": "Start", "to": "idle"},
		{"from": "idle", "to": "jump"},
		{"from": "idle", "to": "walk", "expression": "get_parent().position.x > 1.0"},
		{"from": "walk", "to": "idle", "advance": "disabled", "switch": "at_end"},
	]
	var result: Dictionary = await _set_up(machine)
	var advances := (result["transitions"] as Array).map(func(transition: Dictionary) -> String: return transition["advance"])
	assert_eq(advances, ["auto", "enabled", "auto", "disabled"])
	assert_eq(((result["transitions"] as Array)[3] as Dictionary)["switch"], "at_end")
	assert_eq(((result["transitions"] as Array)[2] as Dictionary)["expression"], "get_parent().position.x > 1.0")


func test_rejects_the_states_and_transitions_it_cannot_use_and_keeps_the_rest() -> void:
	var result: Dictionary = await _set_up({
		"tree": TREE,
		"player": PLAYER,
		"states": [
			{"name": "run", "animation": "sprint"},
			{"name": "idle", "animation": "idle"},
			{"name": "idle", "animation": "walk"},
			{"name": "Start", "animation": "idle"},
			{"name": "a/b", "animation": "idle"},
		],
		"transitions": [
			{"from": "idle", "to": "run"},
			{"from": "End", "to": "idle"},
			{"from": "Start", "to": "idle"},
			{"from": "Start", "to": "idle"},
			{"from": "idle", "to": "Start"},
			{"from": "idle", "to": "idle"},
			{"from": "idle", "to": "End", "condition": "bad name"},
			{"from": "idle", "to": "End", "expression": "1 +"},
		],
	})
	var rejected := (result["rejected"] as Array).map(func(rejection: Dictionary) -> String: return rejection["item"])
	assert_eq(rejected, ["run", "idle", "Start", "a/b", "idle -> run", "End -> idle", "Start -> idle", "idle -> Start", "idle -> idle", "idle -> End", "idle -> End"])
	var reasons := (result["rejected"] as Array).map(func(rejection: Dictionary) -> String: return rejection["reason"])
	assert_string_contains(reasons[0], "sprint")
	assert_string_contains(reasons[1], "twice")
	assert_string_contains(reasons[2], "Start")
	assert_string_contains(reasons[3], "/")
	assert_string_contains(reasons[4], "run")
	assert_string_contains(reasons[9], "condition")
	assert_string_contains(reasons[10], "expression")
	assert_eq(result["states"], [{"name": "idle", "animation": "idle"}])
	assert_eq((result["transitions"] as Array).size(), 1)


func test_warns_when_no_transition_leaves_start() -> void:
	var machine := _walking_machine()
	machine["transitions"] = [{"from": "idle", "to": "walk", "condition": "moving"}]
	var result: Dictionary = await _set_up(machine)
	assert_eq((result["warnings"] as Array).size(), 1)
	assert_string_contains((result["warnings"] as Array)[0], "Start")


func test_explains_what_it_needs() -> void:
	var no_player: CommandError = await _set_up({"tree": TREE, "states": [{"name": "idle", "animation": "idle"}], "transitions": []})
	assert_eq(no_player.code, JsonRpc.INVALID_PARAMS)
	assert_string_contains(no_player.message, "AnimationPlayer")
	var not_a_tree: CommandError = await _set_up({"tree": PLAYER, "player": PLAYER, "states": [{"name": "idle", "animation": "idle"}]})
	assert_eq(not_a_tree.message, "Character/AnimationPlayer is an AnimationPlayer, not an AnimationTree")
	var not_a_player: CommandError = await _set_up({"tree": TREE, "player": "Character", "states": [{"name": "idle", "animation": "idle"}]})
	assert_eq(not_a_player.message, "Character is a Node3D, not an AnimationPlayer")
	var no_states: CommandError = await _set_up({"tree": TREE, "player": PLAYER, "states": []})
	assert_eq(no_states.code, JsonRpc.INVALID_PARAMS)
	var nothing_usable: Dictionary = await _set_up({"tree": TREE, "player": PLAYER, "states": [{"name": "run", "animation": "sprint"}]})
	assert_eq(nothing_usable["states"], [])
	assert_null(_tree.tree_root)


func test_reads_the_state_machine_of_a_tree() -> void:
	var empty: Dictionary = await AnimationTreeGetCommand.new(_context).execute({"tree": TREE})
	assert_eq(empty, {"scene": "res://level.tscn", "tree": TREE, "player": "", "active": true, "expression_base": ".", "root": ""})
	await _set_up(_walking_machine())
	var result: Dictionary = await AnimationTreeGetCommand.new(_context).execute({"tree": TREE})
	assert_eq(result["player"], PLAYER)
	assert_eq(result["root"], "AnimationNodeStateMachine")
	assert_eq(result["states"], [{"name": "idle", "animation": "idle"}, {"name": "walk", "animation": "walk"}])
	assert_eq((result["transitions"] as Array).size(), 3)
	assert_eq(result["conditions"], ["moving", "stopped"])
