extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpEditorRunScriptCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_run_script_command.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpNodeCallMethodCommand := preload("res://addons/godot_mcp_tool/commands/node/node_call_method_command.gd")
const GodotMcpPingCommand := preload("res://addons/godot_mcp_tool/commands/ping_command.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpUnsafeCommand := preload("res://addons/godot_mcp_tool/commands/unsafe_command.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _root: Node3D
var _camera: Camera3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = "res://levels/arena.tscn"
	_scenes.edited_root = _root
	add_child(_root)
	_camera = Camera3D.new()
	_camera.name = "Camera"
	_root.add_child(_camera)
	_camera.owner = _root
	_camera.position = Vector3(0, 5, 10)
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())


func after_each() -> void:
	_history.dispose()
	remove_child(_root)
	_scenes.release()


func test_runs_an_unsafe_command_only_when_the_editor_allows_it() -> void:
	var refused: GodotMcpCommandError = await GodotMcpUnsafeCommand.new(GodotMcpPingCommand.new(), func() -> bool: return false).execute({})
	var allowed: Variant = await GodotMcpUnsafeCommand.new(GodotMcpPingCommand.new(), func() -> bool: return true).execute({})
	assert_eq(refused.code, GodotMcpJsonRpc.UNSAFE_DISABLED)
	assert_string_contains(refused.hint, "Allow Unsafe Tools")
	assert_false(allowed is GodotMcpCommandError)


func test_runs_code_in_the_editor_and_returns_its_value() -> void:
	var result: Dictionary = await GodotMcpEditorRunScriptCommand.new(_context).execute({"code": "var names := []\nfor child in scene.get_children():\n\tnames.append(child.name)\nreturn names"})
	assert_eq(result["value"], ["Camera"])
	assert_eq(result["errors"], [])


func test_runs_code_indented_with_spaces() -> void:
	var result: Dictionary = await GodotMcpEditorRunScriptCommand.new(_context).execute({"code": "var total := 0\nfor i in 3:\n    total += i\nreturn total"})
	assert_eq(result["value"], 3)


func test_reports_code_that_does_not_compile_with_its_own_line_numbers() -> void:
	var result: GodotMcpCommandError = await GodotMcpEditorRunScriptCommand.new(_context).execute({"code": "var speed := 5\nvar x = 1 2\nreturn x"})
	assert_eq(result.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains(result.message, "does not compile")
	assert_string_contains(result.message, "line 2:")
	assert_engine_error("Parse Error")


func test_reports_errors_while_the_code_runs() -> void:
	var result: Dictionary = await GodotMcpEditorRunScriptCommand.new(_context).execute({"code": "var items := [1]\nreturn items[5]"})
	assert_null(result["value"])
	assert_eq((result["errors"] as Array).size(), 1)
	assert_eq(((result["errors"] as Array)[0] as Dictionary)["line"], 2)
	assert_string_contains(((result["errors"] as Array)[0] as Dictionary)["message"], "Out of bounds")
	assert_engine_error("Out of bounds")


func test_calls_a_node_method_and_records_the_changed_properties_for_undo() -> void:
	var before := _camera.transform
	var result: Dictionary = await GodotMcpNodeCallMethodCommand.new(_context).execute({"path": "Camera", "method": "look_at", "args": [[0, 0, 0]]})
	assert_eq(result["scene"], "res://levels/arena.tscn")
	assert_eq(result["path"], "Camera")
	assert_has(result["changed"], "rotation")
	assert_ne(_camera.transform, before)
	assert_eq(_history.last_action_name(), "MCP: Call look_at on Camera")
	assert_true(_history.undo())
	assert_true(_camera.transform.is_equal_approx(before))


func test_returns_the_value_of_a_method() -> void:
	var result: Dictionary = await GodotMcpNodeCallMethodCommand.new(_context).execute({"path": "Camera", "method": "get_child_count"})
	assert_eq(result["value"], 0)
	assert_eq(result["changed"], [])
	assert_eq(_history.last_action_name(), "")


func test_explains_unknown_methods_and_wrong_arguments() -> void:
	var command := GodotMcpNodeCallMethodCommand.new(_context)
	var unknown: GodotMcpCommandError = await command.execute({"path": "Camera", "method": "look_att"})
	var too_few: GodotMcpCommandError = await command.execute({"path": "Camera", "method": "look_at"})
	var wrong_type: GodotMcpCommandError = await command.execute({"path": "Camera", "method": "look_at", "args": ["up"]})
	assert_eq(unknown.code, GodotMcpJsonRpc.NOT_FOUND)
	assert_string_contains(unknown.hint, "look_at")
	assert_string_contains(too_few.message, "look_at takes")
	assert_string_contains(wrong_type.message, "target")
