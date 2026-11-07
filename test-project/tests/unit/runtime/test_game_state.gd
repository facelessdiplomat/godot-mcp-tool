extends GutTest

const GodotMcpGameState := preload("res://addons/godot_mcp_tool/runtime/game_state.gd")
const GodotMcpRunRequest := preload("res://addons/godot_mcp_tool/runtime/run_request.gd")

var _game: GodotMcpGameState


func before_each() -> void:
	_game = GodotMcpGameState.new()


func test_starts_stopped() -> void:
	assert_eq(_game.state, GodotMcpGameState.STOPPED)


func test_follows_a_run_through_its_lifecycle() -> void:
	_game.mark_started(12)
	assert_eq(_game.state, GodotMcpGameState.STARTING)
	assert_eq(_game.first_seq, 12)
	_game.mark_ready("res://levels/arena.tscn")
	assert_eq(_game.state, GodotMcpGameState.RUNNING)
	assert_eq(_game.scene, "res://levels/arena.tscn")
	_game.mark_paused()
	assert_eq(_game.state, GodotMcpGameState.PAUSED)
	_game.mark_resumed()
	assert_eq(_game.state, GodotMcpGameState.RUNNING)
	_game.mark_stopped()
	assert_eq(_game.state, GodotMcpGameState.STOPPED)


func test_hands_out_an_agent_run_request_once() -> void:
	_game.request_agent_run(GodotMcpRunRequest.new(30))
	assert_eq(_game.take_agent_run_request().fixed_fps, 30)
	assert_null(_game.take_agent_run_request())
