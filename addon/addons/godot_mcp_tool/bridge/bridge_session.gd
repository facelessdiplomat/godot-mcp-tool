extends RefCounted

const Authenticator := preload("authenticator.gd")
const CommandError := preload("../commands/command_error.gd")
const CommandRouter := preload("../commands/command_router.gd")
const JsonRpc := preload("json_rpc.gd")

var is_authenticated := false
var should_close := false

var _authenticator: Authenticator
var _router: CommandRouter
var _build_hello_payload: Callable


func _init(authenticator: Authenticator, router: CommandRouter, build_hello_payload: Callable) -> void:
	_authenticator = authenticator
	_router = router
	_build_hello_payload = build_hello_payload


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
	return _run_command(request_id, method, params)


func _answer_hello(request_id: Variant, params: Dictionary) -> Dictionary:
	var rejection := _authenticator.verify(params)
	if rejection != null:
		should_close = true
		return JsonRpc.failure(request_id, rejection.code, rejection.message, rejection.hint)
	is_authenticated = true
	return JsonRpc.success(request_id, _build_hello_payload.call())


func _run_command(request_id: Variant, method: String, params: Dictionary) -> Dictionary:
	var command := _router.find(method)
	if command == null:
		return JsonRpc.failure(
			request_id,
			JsonRpc.METHOD_NOT_FOUND,
			"Unknown method %s" % method,
			"Available methods: %s" % ", ".join(_router.methods()))
	var outcome: Variant = command.execute(params)
	if outcome is CommandError:
		return JsonRpc.failure(request_id, outcome.code, outcome.message, outcome.hint)
	return JsonRpc.success(request_id, outcome)


static func _normalize_request_id(request_id: Variant) -> Variant:
	if request_id is float and is_equal_approx(request_id, roundf(request_id)):
		return int(request_id)
	return request_id
