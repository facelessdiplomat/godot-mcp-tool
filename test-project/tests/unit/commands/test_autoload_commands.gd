extends GutTest

const AutoloadAddCommand := preload("res://addons/godot_mcp_tool/commands/project/autoload_add_command.gd")
const AutoloadRemoveCommand := preload("res://addons/godot_mcp_tool/commands/project/autoload_remove_command.gd")
const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const FakeAutoloadRegistry := preload("res://tests/support/fake_autoload_registry.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")

const PATROL_POINT_SCRIPT := "res://tests/fixtures/patrol_point.gd"
const ENEMY_STATS_SCRIPT := "res://tests/fixtures/enemy_stats.gd"
const CRATE_SCENE := "res://tests/fixtures/crate.tscn"

var _registry: FakeAutoloadRegistry
var _save_calls := 0


func before_each() -> void:
	_registry = FakeAutoloadRegistry.new()
	_save_calls = 0


func after_each() -> void:
	for autoload_name in ["Patrols", "CrateSpawner"]:
		_registry.forget(autoload_name)


func _fake_save() -> Error:
	_save_calls += 1
	return OK


func _autoload_names(result: Dictionary) -> Array:
	return (result["autoloads"] as Array).map(func(autoload: Dictionary) -> String: return autoload["name"])


func test_adds_a_script_as_an_autoload_and_saves_the_project() -> void:
	var result: Dictionary = await AutoloadAddCommand.new(_registry, _fake_save).execute({"name": "Patrols", "path": PATROL_POINT_SCRIPT})
	assert_eq(_registry.added, [{"name": "Patrols", "path": PATROL_POINT_SCRIPT}] as Array[Dictionary])
	assert_eq(_save_calls, 1)
	assert_eq(result["name"], "Patrols")
	assert_eq(result["path"], PATROL_POINT_SCRIPT)
	assert_has(_autoload_names(result), "Patrols")


func test_adds_a_scene_as_an_autoload() -> void:
	var result: Dictionary = await AutoloadAddCommand.new(_registry, _fake_save).execute({"name": "CrateSpawner", "path": CRATE_SCENE})
	assert_eq(result["path"], CRATE_SCENE)


func test_refuses_what_godot_cannot_load_as_an_autoload() -> void:
	var command := AutoloadAddCommand.new(_registry, _fake_save)
	var taken_name: CommandError = await command.execute({"name": "Node3D", "path": PATROL_POINT_SCRIPT})
	var missing_file: CommandError = await command.execute({"name": "Patrols", "path": "res://missing.gd"})
	var not_a_node: CommandError = await command.execute({"name": "Patrols", "path": ENEMY_STATS_SCRIPT})
	var outside: CommandError = await command.execute({"name": "Patrols", "path": "user://patrols.gd"})
	assert_string_contains(taken_name.message, "engine class")
	assert_eq(missing_file.code, JsonRpc.NOT_FOUND)
	assert_string_contains(not_a_node.message, "does not extend Node")
	assert_eq(outside.code, JsonRpc.INVALID_PARAMS)
	assert_eq(_registry.added.size(), 0)
	assert_eq(_save_calls, 0)


func test_refuses_a_name_that_is_already_an_autoload() -> void:
	var command := AutoloadAddCommand.new(_registry, _fake_save)
	await command.execute({"name": "Patrols", "path": PATROL_POINT_SCRIPT})
	var again: CommandError = await command.execute({"name": "Patrols", "path": CRATE_SCENE})
	assert_string_contains(again.message, "already an autoload")
	assert_string_contains(again.hint, "autoload_remove")


func test_removes_an_autoload_and_saves_the_project() -> void:
	await AutoloadAddCommand.new(_registry, _fake_save).execute({"name": "Patrols", "path": PATROL_POINT_SCRIPT})
	var result: Dictionary = await AutoloadRemoveCommand.new(_registry, _fake_save).execute({"name": "Patrols"})
	assert_eq(_registry.removed, PackedStringArray(["Patrols"]))
	assert_eq(result["path"], PATROL_POINT_SCRIPT)
	assert_does_not_have(_autoload_names(result), "Patrols")
	assert_eq(_save_calls, 2)


func test_explains_an_unknown_autoload_with_similar_names() -> void:
	await AutoloadAddCommand.new(_registry, _fake_save).execute({"name": "Patrols", "path": PATROL_POINT_SCRIPT})
	var result: CommandError = await AutoloadRemoveCommand.new(_registry, _fake_save).execute({"name": "Patrol"})
	assert_eq(result.code, JsonRpc.NOT_FOUND)
	assert_string_contains(result.hint, "Patrols")


func test_keeps_the_runtime_agent_of_this_addon() -> void:
	var result: CommandError = await AutoloadRemoveCommand.new(_registry, _fake_save).execute({"name": "GodotMcpRuntime"})
	assert_string_contains(result.message, "GodotMcpRuntime")
	assert_eq(_registry.removed.size(), 0)
