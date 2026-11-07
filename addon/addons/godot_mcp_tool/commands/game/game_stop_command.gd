extends "../command.gd"

const GodotMcpRuntimeContext := preload("../../runtime/runtime_context.gd")
const GodotMcpWaiting := preload("../../util/waiting.gd")

const STOP_TIMEOUT_MSEC := 10_000

var _runtime: GodotMcpRuntimeContext


func _init(runtime: GodotMcpRuntimeContext) -> void:
	_runtime = runtime


func execute(_params: Dictionary) -> Variant:
	var launcher := _runtime.launcher
	if not launcher.is_playing():
		return {"was_running": false}
	launcher.stop()
	if not await GodotMcpWaiting.until(func() -> bool: return not launcher.is_playing(), STOP_TIMEOUT_MSEC):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.TIMEOUT, "The game did not stop within %d ms" % STOP_TIMEOUT_MSEC, "Stop it in the editor.")
	return {"was_running": true}
