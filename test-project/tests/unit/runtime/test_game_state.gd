extends GutTest

const GameState := preload("res://addons/godot_mcp_tool/runtime/game_state.gd")
const RunRequest := preload("res://addons/godot_mcp_tool/runtime/run_request.gd")

var _game: GameState


func before_each() -> void:
	_game = GameState.new()


func test_starts_stopped() -> void:
	assert_eq(_game.state, GameState.STOPPED)


func test_follows_a_run_through_its_lifecycle() -> void:
	_game.mark_started(12)
	assert_eq(_game.state, GameState.STARTING)
	assert_eq(_game.first_seq, 12)
	_game.mark_ready("res://levels/arena.tscn")
	assert_eq(_game.state, GameState.RUNNING)
	assert_eq(_game.scene, "res://levels/arena.tscn")
	_game.mark_paused()
	assert_eq(_game.state, GameState.PAUSED)
	_game.mark_resumed()
	assert_eq(_game.state, GameState.RUNNING)
	_game.mark_stopped()
	assert_eq(_game.state, GameState.STOPPED)


func test_hands_out_an_agent_run_request_once() -> void:
	_game.request_agent_run(RunRequest.new(30))
	assert_eq(_game.take_agent_run_request().fixed_fps, 30)
	assert_null(_game.take_agent_run_request())
