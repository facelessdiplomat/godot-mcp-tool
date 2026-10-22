extends "../command.gd"

const GameState := preload("../../runtime/game_state.gd")
const RuntimeContext := preload("../../runtime/runtime_context.gd")

var _runtime: RuntimeContext
var _game_method: String
var _answer_timeout_msec: int


func _init(runtime: RuntimeContext, game_method: String, answer_timeout_msec: int) -> void:
	_runtime = runtime
	_game_method = game_method
	_answer_timeout_msec = answer_timeout_msec


func execute(params: Dictionary) -> Variant:
	match _runtime.game.state:
		GameState.STOPPED:
			return CommandError.new(JsonRpc.GAME_NOT_RUNNING, "The game is not running", "Start it with game_run; inspecting the game needs a run from the editor.")
		GameState.STARTING:
			return CommandError.new(JsonRpc.GAME_NOT_RUNNING, "The game is still starting", "Try again once game_run has returned.")
	return await _runtime.channel.request(_game_method, params, _answer_timeout_msec)
