extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const CommandRouter := preload("../commands/command_router.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")

var _router: CommandRouter


func _init(router: CommandRouter) -> void:
	_router = router


func respond(request: Dictionary) -> Dictionary:
	var method := str(request.get("method", ""))
	var params: Variant = request.get("params", {})
	var command := _router.find(method)
	var outcome: Variant = null
	if command == null:
		outcome = CommandError.new(JsonRpc.METHOD_NOT_FOUND, "The game does not know the request %s" % method, "Known requests: %s" % ", ".join(_router.methods()))
	else:
		outcome = await command.execute(params if params is Dictionary else {})
	var answer := {"id": request.get("id")}
	if outcome is CommandError:
		answer["error"] = {"code": outcome.code, "message": outcome.message, "hint": outcome.hint}
	else:
		answer["result"] = outcome
	return answer
