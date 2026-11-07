extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeGameLauncher := preload("res://tests/support/fake_game_launcher.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpGameChannel := preload("res://addons/godot_mcp_tool/runtime/game_channel.gd")
const GodotMcpGameGetOutputCommand := preload("res://addons/godot_mcp_tool/commands/game/game_get_output_command.gd")
const GodotMcpGameRequestCommand := preload("res://addons/godot_mcp_tool/commands/game/game_request_command.gd")
const GodotMcpGameRunCommand := preload("res://addons/godot_mcp_tool/commands/game/game_run_command.gd")
const GodotMcpGameState := preload("res://addons/godot_mcp_tool/runtime/game_state.gd")
const GodotMcpGameStopCommand := preload("res://addons/godot_mcp_tool/commands/game/game_stop_command.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpLogStore := preload("res://addons/godot_mcp_tool/runtime/log_store.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpRunRequest := preload("res://addons/godot_mcp_tool/runtime/run_request.gd")
const GodotMcpRuntimeContext := preload("res://addons/godot_mcp_tool/runtime/runtime_context.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const MAIN_SCENE_SETTING := "application/run/main_scene"

var _scenes: FakeSceneAccess
var _scripts: FakeScriptEditorAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _game: GodotMcpGameState
var _log_store: GodotMcpLogStore
var _launcher: FakeGameLauncher
var _runtime: GodotMcpRuntimeContext
var _channel: GodotMcpGameChannel
var _game_requests: Array = []
var _main_scene: Variant


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_scripts = FakeScriptEditorAccess.new()
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), _scripts)
	_game = GodotMcpGameState.new()
	_log_store = GodotMcpLogStore.new()
	_launcher = FakeGameLauncher.new(_game, _log_store)
	_game_requests = []
	_channel = GodotMcpGameChannel.new(func(payload: Dictionary) -> bool:
		_game_requests.append(payload)
		_answer_soon(payload)
		return true)
	_runtime = GodotMcpRuntimeContext.new(_game, _log_store, _launcher, _channel)
	_main_scene = ProjectSettings.get_setting(MAIN_SCENE_SETTING)


func after_each() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, _main_scene)
	_history.dispose()
	_scenes.release()


func _ready_game_printing(message: String) -> Callable:
	return func(_target: String) -> void:
		_log_store.append({"level": "info", "message": message}, "game")
		_game.mark_ready("res://main.tscn")


func _run(params: Dictionary) -> Variant:
	return await GodotMcpGameRunCommand.new(_context, _runtime).execute(params)


func test_runs_the_main_scene_and_returns_its_first_output() -> void:
	_launcher.simulate_game = _ready_game_printing("Hello from main")
	var result: Dictionary = await _run({"watch_ms": 0})
	assert_eq(_launcher.started_targets, ["main"])
	assert_eq(result["outcome"], "ready")
	assert_eq(result["state"], GodotMcpGameState.RUNNING)
	assert_eq(result["scene"], "res://main.tscn")
	assert_eq(((result["output"] as Array)[0] as Dictionary)["message"], "Hello from main")


func test_marks_its_runs_as_agent_runs() -> void:
	_launcher.simulate_game = _ready_game_printing("")
	await _run({"watch_ms": 0})
	assert_eq(_launcher.agent_runs.size(), 1)
	assert_eq((_launcher.agent_runs[0] as GodotMcpRunRequest).fixed_fps, 0)


func test_asks_for_a_fixed_frame_rate() -> void:
	_launcher.simulate_game = _ready_game_printing("")
	await _run({"watch_ms": 0, "fixed_fps": 60})
	assert_eq((_launcher.agent_runs[0] as GodotMcpRunRequest).fixed_fps, 60)


func test_refuses_a_fixed_frame_rate_out_of_range() -> void:
	var result: GodotMcpCommandError = await _run({"fixed_fps": 0})
	assert_eq(result.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_eq(_launcher.agent_runs.size(), 0)


func test_runs_a_given_scene() -> void:
	_launcher.simulate_game = _ready_game_printing("")
	await _run({"scene": "res://tests/fixtures/crate.tscn", "watch_ms": 0})
	assert_eq(_launcher.started_targets, ["res://tests/fixtures/crate.tscn"])


func test_reports_a_game_that_stops_before_it_is_ready() -> void:
	_launcher.simulate_game = func(_target: String) -> void:
		_log_store.append({"level": "error", "message": "Parse Error: Expected end of statement.", "location": "res://main.gd:3"}, "game")
		_launcher.playing = false
		_game.mark_stopped()
	var result: Dictionary = await _run({"watch_ms": 0})
	assert_eq(result["outcome"], "stopped")
	assert_eq(result["state"], GodotMcpGameState.STOPPED)
	assert_eq(((result["output"] as Array)[0] as Dictionary)["level"], "error")


func test_returns_when_the_game_stops_in_the_debugger_before_it_is_ready() -> void:
	_launcher.simulate_game = func(_target: String) -> void: _game.mark_paused()
	var result: Dictionary = await _run({"watch_ms": 0, "startup_timeout_ms": 5000})
	assert_eq(result["outcome"], "paused")
	assert_eq(result["state"], GodotMcpGameState.PAUSED)


func test_gives_up_waiting_for_a_game_that_never_gets_ready() -> void:
	var result: Dictionary = await _run({"watch_ms": 0, "startup_timeout_ms": 50})
	assert_eq(result["outcome"], "timeout")


func test_restarts_a_running_game() -> void:
	_launcher.playing = true
	_launcher.simulate_game = _ready_game_printing("")
	await _run({"watch_ms": 0})
	assert_eq(_launcher.stop_requests, 1)
	assert_eq(_launcher.started_targets.size(), 1)


func test_stops_the_game_after_watching_it_when_asked() -> void:
	_launcher.simulate_game = _ready_game_printing("")
	var result: Dictionary = await _run({"watch_ms": 0, "stop_after": true})
	assert_eq(result["state"], GodotMcpGameState.STOPPED)
	assert_false(_launcher.playing)


func test_only_returns_output_from_this_run() -> void:
	_log_store.append({"level": "error", "message": "from an earlier run"}, "game")
	_launcher.simulate_game = _ready_game_printing("this run")
	var result: Dictionary = await _run({"watch_ms": 0})
	assert_eq((result["output"] as Array).map(func(entry: Dictionary) -> String: return entry["message"]), ["this run"])


func test_names_the_scenes_and_scripts_that_running_saves() -> void:
	_launcher.unsaved = PackedStringArray(["res://levels/arena.tscn"])
	_scripts.unsaved = PackedStringArray(["res://player/player.gd"])
	_launcher.simulate_game = _ready_game_printing("")
	var result: Dictionary = await _run({"watch_ms": 0})
	assert_eq(result["saved_scenes"], ["res://levels/arena.tscn"])
	assert_eq(result["saved_scripts"], ["res://player/player.gd"])


func test_refuses_to_run_over_a_script_changed_on_disk() -> void:
	_scripts.unsaved = PackedStringArray(["res://player/player.gd"])
	_scripts.changed_outside = PackedStringArray(["player.gd"])
	var error: Variant = await _run({"watch_ms": 0})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.CONFLICT)
	assert_eq(_launcher.started_targets, [])


func test_skips_the_conflict_check_when_running_saves_nothing() -> void:
	_launcher.save_before_running = false
	_scripts.changed_outside = PackedStringArray(["player.gd"])
	_launcher.simulate_game = _ready_game_printing("")
	var result: Dictionary = await _run({"watch_ms": 0})
	assert_eq(result["outcome"], "ready")


func test_explains_a_missing_main_scene() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, "")
	var error: Variant = await _run({"watch_ms": 0})
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).hint, "application/run/main_scene")
	assert_eq(_launcher.started_targets, [])


func test_explains_a_missing_scene_file() -> void:
	var error: Variant = await _run({"scene": "res://levels/missing.tscn", "watch_ms": 0})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.NOT_FOUND)


func test_runs_the_current_scene_only_when_it_has_a_file() -> void:
	var error: Variant = await _run({"scene": "current", "watch_ms": 0})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.NO_SCENE)


func test_stops_a_running_game() -> void:
	_launcher.playing = true
	var result: Dictionary = await GodotMcpGameStopCommand.new(_runtime).execute({})
	assert_eq(result, {"was_running": true})
	assert_false(_launcher.playing)


func test_stopping_without_a_game_is_harmless() -> void:
	var result: Dictionary = await GodotMcpGameStopCommand.new(_runtime).execute({})
	assert_eq(result, {"was_running": false})


func test_reads_the_output_of_the_current_run_by_default() -> void:
	_log_store.append({"level": "info", "message": "earlier"}, "game")
	_game.mark_started(_log_store.last_seq + 1)
	_log_store.append({"level": "info", "message": "now"}, "game")
	var result: Dictionary = await GodotMcpGameGetOutputCommand.new(_runtime).execute({})
	assert_eq((result["entries"] as Array).map(func(entry: Dictionary) -> String: return entry["message"]), ["now"])
	assert_eq(result["next_after"], 2)


func test_reads_output_after_a_cursor_by_level() -> void:
	_game.mark_started(1)
	_log_store.append({"level": "info", "message": "a"}, "game")
	_log_store.append({"level": "error", "message": "b"}, "game")
	_log_store.append({"level": "error", "message": "c"}, "editor")
	var result: Dictionary = await GodotMcpGameGetOutputCommand.new(_runtime).execute({"after": 2, "levels": ["error"]})
	assert_eq((result["entries"] as Array).map(func(entry: Dictionary) -> String: return entry["message"]), ["c"])


func test_reads_the_current_run_when_the_cursor_belongs_to_another_editor() -> void:
	_game.mark_started(1)
	_log_store.append({"level": "info", "message": "fresh"}, "game")
	var result: Dictionary = await GodotMcpGameGetOutputCommand.new(_runtime).execute({"after": 400})
	assert_eq((result["entries"] as Array).map(func(entry: Dictionary) -> String: return entry["message"]), ["fresh"])


func _answer_soon(payload: Dictionary) -> void:
	await get_tree().process_frame
	_channel.receive({"id": payload["id"], "result": {"asked": payload["method"]}})


func test_asks_the_running_game_and_returns_its_answer() -> void:
	_game.mark_started(1)
	_game.mark_ready("res://main.tscn")
	var result: Variant = await GodotMcpGameRequestCommand.new(_runtime, "tree", 1000).execute({"path": "."})
	assert_eq(result, {"asked": "tree"})
	assert_eq((_game_requests[0] as Dictionary)["params"], {"path": "."})


func test_asks_a_game_that_is_stopped_in_the_debugger() -> void:
	_game.mark_started(1)
	_game.mark_ready("res://main.tscn")
	_game.mark_paused()
	var result: Variant = await GodotMcpGameRequestCommand.new(_runtime, "properties.get", 1000).execute({"path": "Player"})
	assert_eq(result, {"asked": "properties.get"})


func test_refuses_to_wait_on_a_game_that_is_stopped_in_the_debugger() -> void:
	_game.mark_started(1)
	_game.mark_ready("res://main.tscn")
	_game.mark_paused()
	var error: Variant = await GodotMcpGameRequestCommand.new(_runtime, "wait", 1000, true).execute({"physics_frames": 10})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.CONFLICT)
	assert_string_contains((error as GodotMcpCommandError).hint, "debug_continue")
	assert_eq(_game_requests, [])


func test_refuses_to_ask_a_game_that_is_not_running() -> void:
	var error: Variant = await GodotMcpGameRequestCommand.new(_runtime, "tree", 1000).execute({})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.GAME_NOT_RUNNING)
	assert_eq(_game_requests, [])


func test_refuses_to_ask_a_game_that_is_still_starting() -> void:
	_game.mark_started(1)
	var error: Variant = await GodotMcpGameRequestCommand.new(_runtime, "tree", 1000).execute({})
	assert_string_contains((error as GodotMcpCommandError).message, "starting")

