extends "../command.gd"

const RuntimeContext := preload("../../runtime/runtime_context.gd")
const Waiting := preload("../../util/waiting.gd")

const STOP_TIMEOUT_MSEC := 10_000

var _runtime: RuntimeContext


func _init(runtime: RuntimeContext) -> void:
	_runtime = runtime


func execute(_params: Dictionary) -> Variant:
	var launcher := _runtime.launcher
	if not launcher.is_playing():
		return {"was_running": false}
	launcher.stop()
	if not await Waiting.until(func() -> bool: return not launcher.is_playing(), STOP_TIMEOUT_MSEC):
		return CommandError.new(JsonRpc.TIMEOUT, "The game did not stop within %d ms" % STOP_TIMEOUT_MSEC, "Stop it in the editor.")
	return {"was_running": true}
