extends "../command.gd"

const GodotMcpGameRequestCommand := preload("game_request_command.gd")
const GodotMcpRuntimeContext := preload("../../runtime/runtime_context.gd")
const GodotMcpScriptProfile := preload("../../runtime/script_profile.gd")

const PROFILE_TOTAL_TIMEOUT_MSEC := 2000
const LISTED_FUNCTIONS := 10

var _measure: GodotMcpGameRequestCommand
var _runtime: GodotMcpRuntimeContext
var _find_debuggers: Callable


func _init(measure: GodotMcpGameRequestCommand, runtime: GodotMcpRuntimeContext, find_debuggers: Callable) -> void:
	_measure = measure
	_runtime = runtime
	_find_debuggers = find_debuggers


func execute(params: Dictionary) -> Variant:
	var profile := GodotMcpScriptProfile.new()
	var profiling := profile.start(_runtime.channel, _find_debuggers.call())
	var result: Variant = await _measure.execute(params)
	var functions: Array = await profile.finish(_runtime.channel, PROFILE_TOTAL_TIMEOUT_MSEC) if profiling else []
	if result is GodotMcpCommandError:
		return result
	result["functions"] = functions.slice(0, LISTED_FUNCTIONS)
	result["profiled"] = profiling
	return result
