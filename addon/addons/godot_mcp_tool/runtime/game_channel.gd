extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")
const Waiting := preload("../util/waiting.gd")

const STOPPED_IN_THE_DEBUGGER_MESSAGE := "The game stopped in the debugger before this call finished; its frames do not advance while it is stopped"
const STOPPED_IN_THE_DEBUGGER_HINT := "debug_state shows where it stopped; debug_continue resumes the game, and the rest of this call plays out then."

var _send: Callable
var _next_request_id := 1
var _answers := {}
var _frame_waiting_ids := {}


func _init(send: Callable) -> void:
	_send = send


func request(method: String, params: Dictionary, timeout_msec: int, waits_for_frames := false) -> Variant:
	var request_id := _next_request_id
	_next_request_id += 1
	_answers[request_id] = null
	if not _send.call({"id": request_id, "method": method, "params": params}):
		_answers.erase(request_id)
		return CommandError.new(JsonRpc.GAME_NOT_RUNNING, "The game is not running", "Start it with game_run.")
	if waits_for_frames:
		_frame_waiting_ids[request_id] = true
	var answered := await Waiting.until(func() -> bool: return _answers.get(request_id) != null, timeout_msec)
	var answer: Variant = _answers.get(request_id)
	_answers.erase(request_id)
	_frame_waiting_ids.erase(request_id)
	if not answered:
		return CommandError.new(JsonRpc.TIMEOUT, "The game did not answer within %d ms" % timeout_msec, "It may be busy or stuck in a long loop; game_get_output shows what it printed.")
	return _outcome_of(answer)


func receive(answer: Variant) -> void:
	if not answer is Dictionary:
		return
	var request_id: Variant = (answer as Dictionary).get("id")
	if _answers.has(request_id):
		_answers[request_id] = answer


func cancel_all(reason: String) -> void:
	for request_id in _answers:
		_answers[request_id] = {"error": {"code": JsonRpc.GAME_NOT_RUNNING, "message": reason, "hint": "Start it again with game_run."}}


func end_frame_waits() -> void:
	for request_id in _frame_waiting_ids:
		if _answers.has(request_id):
			_answers[request_id] = {"error": {"code": JsonRpc.CONFLICT, "message": STOPPED_IN_THE_DEBUGGER_MESSAGE, "hint": STOPPED_IN_THE_DEBUGGER_HINT}}


static func _outcome_of(answer: Dictionary) -> Variant:
	if answer.has("error"):
		var error: Dictionary = answer["error"]
		return CommandError.new(int(error.get("code", JsonRpc.OPERATION_FAILED)), str(error.get("message", "The game reported an error")), str(error.get("hint", "")))
	return answer.get("result", {})
