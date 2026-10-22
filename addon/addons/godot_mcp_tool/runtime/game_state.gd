extends RefCounted

const STOPPED := "stopped"
const STARTING := "starting"
const RUNNING := "running"
const PAUSED := "paused"

var state := STOPPED
var scene := ""
var first_seq := 1
var ready_count := 0
var stop_count := 0

var _agent_run_requested := false


func request_agent_run() -> void:
	_agent_run_requested = true


func take_agent_run_request() -> bool:
	var was_requested := _agent_run_requested
	_agent_run_requested = false
	return was_requested


func mark_started(run_first_seq: int) -> void:
	state = STARTING
	scene = ""
	first_seq = run_first_seq


func mark_ready(scene_path: String) -> void:
	state = RUNNING
	scene = scene_path
	ready_count += 1


func mark_paused() -> void:
	if state != STOPPED:
		state = PAUSED


func mark_resumed() -> void:
	if state == PAUSED:
		state = RUNNING


func mark_stopped() -> void:
	state = STOPPED
	stop_count += 1
