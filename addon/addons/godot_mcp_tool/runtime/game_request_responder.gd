extends RefCounted

const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpCommandRouter := preload("../commands/command_router.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")

var _router: GodotMcpCommandRouter


func _init(router: GodotMcpCommandRouter) -> void:
	_router = router


func respond(request: Dictionary) -> Dictionary:
	var method := str(request.get("method", ""))
	var params: Variant = request.get("params", {})
	var command := _router.find(method)
	var outcome: Variant = null
	if command == null:
		outcome = GodotMcpCommandError.new(GodotMcpJsonRpc.METHOD_NOT_FOUND, "The game does not know the request %s" % method, "Known requests: %s" % ", ".join(_router.methods()))
	else:
		outcome = await command.execute(params if params is Dictionary else {})
	var answer := {"id": request.get("id")}
	if outcome is GodotMcpCommandError:
		answer["error"] = {"code": outcome.code, "message": outcome.message, "hint": outcome.hint}
	else:
		answer["result"] = outcome
	return answer
