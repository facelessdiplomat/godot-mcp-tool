extends RefCounted

const Authenticator := preload("authenticator.gd")
const CommandError := preload("../commands/command_error.gd")
const CommandRouter := preload("../commands/command_router.gd")
const JsonRpc := preload("json_rpc.gd")

var is_authenticated := false
var should_close := false

const STATUS_NOTIFICATION := "log.status"
const KEEPALIVE_METHODS := ["ping"]

var _authenticator: Authenticator
var _router: CommandRouter
var _build_hello_payload: Callable
var _read_status: Callable
var _wait_for_first_scan: Callable
var _record_command: Callable
var _last_sent_status: Variant = null
var _notifications: Array = []


func _init(
	authenticator: Authenticator,
	router: CommandRouter,
	build_hello_payload: Callable,
	read_status: Callable = Callable(),
	wait_for_first_scan: Callable = Callable(),
	record_command: Callable = Callable(),
) -> void:
	_authenticator = authenticator
	_router = router
	_build_hello_payload = build_hello_payload
	_read_status = read_status
	_wait_for_first_scan = wait_for_first_scan
	_record_command = record_command


func take_notifications() -> Array:
	var taken := _notifications
	_notifications = []
	return taken


func handle_line(line: String) -> Dictionary:
	var json := JSON.new()
	if json.parse(line) != OK or not json.data is Dictionary:
		should_close = true
		return JsonRpc.failure(null, JsonRpc.PARSE_ERROR, "Expected one JSON-RPC request object per line")
	var request: Dictionary = json.data
	var request_id: Variant = _normalize_request_id(request.get("id"))
	var method: Variant = request.get("method")
	if not method is String:
		return JsonRpc.failure(request_id, JsonRpc.INVALID_REQUEST, "The request has no method")
	var params: Variant = request.get("params", {})
	if not params is Dictionary:
		return JsonRpc.failure(request_id, JsonRpc.INVALID_PARAMS, "The params of %s must be an object" % method)
	if method == "hello":
		return _answer_hello(request_id, params)
	if not is_authenticated:
		should_close = true
		return JsonRpc.failure(request_id, JsonRpc.UNAUTHORIZED, "Send hello with the token before %s" % method)
	return await _run_command(request_id, method, params)


func _answer_hello(request_id: Variant, params: Dictionary) -> Dictionary:
	var rejection := _authenticator.verify(params)
	if rejection != null:
		should_close = true
		return JsonRpc.failure(request_id, rejection.code, rejection.message, rejection.hint)
	is_authenticated = true
	_queue_status_if_changed()
	return JsonRpc.success(request_id, _build_hello_payload.call())


func _run_command(request_id: Variant, method: String, params: Dictionary) -> Dictionary:
	var started_msec := Time.get_ticks_msec()
	var answer := await _answer_command(request_id, method, params)
	if _record_command.is_valid() and not method in KEEPALIVE_METHODS:
		var error: Variant = answer.get("error")
		_record_command.call(method, str((error as Dictionary)["message"]) if error is Dictionary else "", Time.get_ticks_msec() - started_msec)
	return answer


func _answer_command(request_id: Variant, method: String, params: Dictionary) -> Dictionary:
	var command := _router.find(method)
	if command == null:
		return JsonRpc.failure(
			request_id,
			JsonRpc.METHOD_NOT_FOUND,
			"Unknown method %s" % method,
			"Available methods: %s" % ", ".join(_router.methods()))
	if not await _is_editor_ready_for(method):
		return JsonRpc.failure(
			request_id,
			JsonRpc.EDITOR_BUSY,
			"The editor is still scanning and importing the project, as it does after it starts",
			"Call again in a few seconds: the first import of a large project takes a while.")
	var outcome: Variant = await command.execute(params)
	_queue_status_if_changed()
	if outcome is CommandError:
		return JsonRpc.failure(request_id, outcome.code, outcome.message, outcome.hint)
	return JsonRpc.success(request_id, outcome)


func _is_editor_ready_for(method: String) -> bool:
	if method in KEEPALIVE_METHODS or not _wait_for_first_scan.is_valid():
		return true
	return await _wait_for_first_scan.call()


func _queue_status_if_changed() -> void:
	if not _read_status.is_valid():
		return
	var status: Variant = _read_status.call()
	if status == _last_sent_status:
		return
	_last_sent_status = status
	_notifications.append(JsonRpc.make_notification(STATUS_NOTIFICATION, status))


static func _normalize_request_id(request_id: Variant) -> Variant:
	if request_id is float and is_equal_approx(request_id, roundf(request_id)):
		return int(request_id)
	return request_id
