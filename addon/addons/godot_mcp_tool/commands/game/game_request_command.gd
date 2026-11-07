extends "../command.gd"

const GodotMcpGameState := preload("../../runtime/game_state.gd")
const GodotMcpRuntimeContext := preload("../../runtime/runtime_context.gd")

var _runtime: GodotMcpRuntimeContext
var _game_method: String
var _answer_timeout_msec: int
var _waits_for_frames: bool


func _init(runtime: GodotMcpRuntimeContext, game_method: String, answer_timeout_msec: int, waits_for_frames := false) -> void:
	_runtime = runtime
	_game_method = game_method
	_answer_timeout_msec = answer_timeout_msec
	_waits_for_frames = waits_for_frames


func execute(params: Dictionary) -> Variant:
	match _runtime.game.state:
		GodotMcpGameState.STOPPED:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.GAME_NOT_RUNNING, "The game is not running", "Start it with game_run.")
		GodotMcpGameState.STARTING:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.GAME_NOT_RUNNING, "The game is still starting", "Try again once game_run has returned.")
		GodotMcpGameState.PAUSED:
			if _waits_for_frames:
				return GodotMcpCommandError.new(
					GodotMcpJsonRpc.CONFLICT,
					"The game is stopped in the debugger, so its frames do not advance",
					"debug_state shows where it stopped; resume it with debug_continue.",
				)
	return await _runtime.channel.request(_game_method, params, _answer_timeout_msec, _waits_for_frames)
