extends Node

signal physics_frame_ended

const LAST_IN_PHYSICS_ORDER := 2147483647

var frames := 0

var _held := false
var _pending_events: Array[InputEvent] = []


func _init() -> void:
	name = "GodotMcpGameTime"
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_physics_priority = LAST_IN_PHYSICS_ORDER


func _physics_process(_delta: float) -> void:
	if not get_tree().paused:
		frames += 1
	physics_frame_ended.emit()


func is_held() -> bool:
	return _held and get_tree().paused


func hold() -> void:
	_held = true
	get_tree().paused = true


func resume() -> void:
	_held = false
	get_tree().paused = false
	_deliver_pending_events()


func let_run() -> bool:
	if not is_held():
		return false
	get_tree().paused = false
	_deliver_pending_events()
	return true


func hold_again_if(was_held: bool) -> void:
	if was_held:
		get_tree().paused = true


func deliver(event: InputEvent) -> void:
	if is_held():
		_pending_events.append(event)
	else:
		_parse(event)


func _deliver_pending_events() -> void:
	var events := _pending_events
	_pending_events = []
	for event in events:
		_parse(event)


static func _parse(event: InputEvent) -> void:
	Input.parse_input_event(event)
	Input.flush_buffered_events()
