extends "res://addons/godot_mcp_tool/runtime/game_launcher.gd"

const GameState := preload("res://addons/godot_mcp_tool/runtime/game_state.gd")
const LogStore := preload("res://addons/godot_mcp_tool/runtime/log_store.gd")

var playing := false
var started_targets: Array = []
var agent_runs: Array = []
var stop_requests := 0
var save_before_running := true
var unsaved := PackedStringArray()
var simulate_game: Callable

var _game: GameState
var _log_store: LogStore


func _init(game: GameState, log_store: LogStore) -> void:
	_game = game
	_log_store = log_store


func is_playing() -> bool:
	return playing


func play_main_scene() -> void:
	_start("main")


func play_current_scene() -> void:
	_start("current")


func play_scene(scene_path: String) -> void:
	_start(scene_path)


func stop() -> void:
	stop_requests += 1
	if playing:
		playing = false
		_game.mark_stopped()


func unsaved_scenes() -> PackedStringArray:
	return unsaved


func saves_before_running() -> bool:
	return save_before_running


func _start(target: String) -> void:
	started_targets.append(target)
	agent_runs.append(_game.take_agent_run_request())
	playing = true
	_game.mark_started(_log_store.last_seq + 1)
	if simulate_game.is_valid():
		simulate_game.call(target)
