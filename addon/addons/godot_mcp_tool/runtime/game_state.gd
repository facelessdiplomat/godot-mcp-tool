extends RefCounted

const GodotMcpRunRequest := preload("run_request.gd")

const STOPPED := "stopped"
const STARTING := "starting"
const RUNNING := "running"
const PAUSED := "paused"

var state := STOPPED
var scene := ""
var first_seq := 1
var ready_count := 0
var stop_count := 0

var _agent_run_request: GodotMcpRunRequest


func request_agent_run(request: GodotMcpRunRequest) -> void:
	_agent_run_request = request


func take_agent_run_request() -> GodotMcpRunRequest:
	var request := _agent_run_request
	_agent_run_request = null
	return request


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
