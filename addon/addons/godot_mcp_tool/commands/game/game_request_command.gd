extends "../command.gd"

const GameState := preload("../../runtime/game_state.gd")
const RuntimeContext := preload("../../runtime/runtime_context.gd")

var _runtime: RuntimeContext
var _game_method: String
var _answer_timeout_msec: int
var _waits_for_frames: bool


func _init(runtime: RuntimeContext, game_method: String, answer_timeout_msec: int, waits_for_frames := false) -> void:
	_runtime = runtime
	_game_method = game_method
	_answer_timeout_msec = answer_timeout_msec
	_waits_for_frames = waits_for_frames


func execute(params: Dictionary) -> Variant:
	match _runtime.game.state:
		GameState.STOPPED:
			return CommandError.new(JsonRpc.GAME_NOT_RUNNING, "The game is not running", "Start it with game_run.")
		GameState.STARTING:
			return CommandError.new(JsonRpc.GAME_NOT_RUNNING, "The game is still starting", "Try again once game_run has returned.")
		GameState.PAUSED:
			if _waits_for_frames:
				return CommandError.new(
					JsonRpc.CONFLICT,
					"The game is stopped in the debugger, so its frames do not advance",
					"debug_state shows where it stopped; resume it with debug_continue.",
				)
	return await _runtime.channel.request(_game_method, params, _answer_timeout_msec)
