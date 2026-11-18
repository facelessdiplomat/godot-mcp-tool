extends RefCounted

const GodotMcpGameChannel := preload("game_channel.gd")
const GodotMcpWaiting := preload("../util/waiting.gd")

const PROFILER := "servers"
const SIGNATURE_MESSAGE := "servers:function_signature"
const TOTAL_MESSAGE := "servers:profile_total"
const DEBUG_DATA_SIGNAL := &"debug_data"
const MAXIMUM_FUNCTIONS := 64
const FRAME_HEADER_SIZE := 6
const FUNCTION_FIELDS := 5
const SIGNATURE_SEPARATOR := "::"
const MILLISECONDS_PER_SECOND := 1000.0
const DECIMAL_SCALE := 10.0
const OWN_SCRIPTS := "res://addons/godot_mcp_tool/"

var _debuggers: Array = []
var _signatures := {}
var _total: Array = []
var _received_total := false


func start(channel: GodotMcpGameChannel, debuggers: Array) -> bool:
	if not channel.toggle_profiler(PROFILER, true, [MAXIMUM_FUNCTIONS, false]):
		return false
	_debuggers = debuggers.filter(func(debugger: Object) -> bool: return debugger.has_signal(DEBUG_DATA_SIGNAL))
	for debugger in _debuggers:
		debugger.connect(DEBUG_DATA_SIGNAL, _on_debug_data)
	return true


func finish(channel: GodotMcpGameChannel, timeout_msec: int) -> Array:
	channel.toggle_profiler(PROFILER, false, [])
	await GodotMcpWaiting.until(func() -> bool: return _received_total, timeout_msec)
	for debugger in _debuggers:
		if is_instance_valid(debugger) and debugger.is_connected(DEBUG_DATA_SIGNAL, _on_debug_data):
			debugger.disconnect(DEBUG_DATA_SIGNAL, _on_debug_data)
	return functions_in(_total, _signatures) if _received_total else []


static func functions_in(total: Array, signatures: Dictionary) -> Array:
	var index := FRAME_HEADER_SIZE
	var servers: int = total[index]
	index += 1
	for server in servers:
		index += 2 + int(total[index + 1])
	var field_count: int = total[index]
	index += 1
	var functions: Array = []
	for start in range(index, index + field_count, FUNCTION_FIELDS):
		var parts: PackedStringArray = str(signatures.get(total[start], "")).split(SIGNATURE_SEPARATOR)
		if int(total[start + 1]) == 0 or parts[0].begins_with(OWN_SCRIPTS):
			continue
		functions.append({
			"script": parts[0] if parts.size() == 3 else "",
			"line": int(parts[1]) if parts.size() == 3 else 0,
			"function": parts[2] if parts.size() == 3 else str(signatures.get(total[start], "?")),
			"calls": int(total[start + 1]),
			"self_ms": _milliseconds(total[start + 2]),
			"total_ms": _milliseconds(total[start + 3]),
		})
	functions.sort_custom(func(left: Dictionary, right: Dictionary) -> bool: return left["self_ms"] > right["self_ms"])
	return functions


func _on_debug_data(message: String, data: Array) -> void:
	match message:
		SIGNATURE_MESSAGE:
			_signatures[data[1]] = data[0]
		TOTAL_MESSAGE:
			_total = data
			_received_total = true


static func _milliseconds(seconds: float) -> float:
	return roundf(seconds * MILLISECONDS_PER_SECOND * DECIMAL_SCALE) / DECIMAL_SCALE
