extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpGameState := preload("../../runtime/game_state.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpRunRequest := preload("../../runtime/run_request.gd")
const GodotMcpRuntimeContext := preload("../../runtime/runtime_context.gd")
const GodotMcpSceneResolver := preload("../../scene/scene_resolver.gd")
const GodotMcpWaiting := preload("../../util/waiting.gd")

const MAIN_TARGET := "main"
const CURRENT_TARGET := "current"
const DEFAULT_WATCH_MSEC := 1000
const DEFAULT_STARTUP_TIMEOUT_MSEC := 30_000
const STOP_TIMEOUT_MSEC := 10_000
const OUTPUT_LIMIT := 60
const MAXIMUM_FIXED_FPS := 1000

var _context: GodotMcpEditingContext
var _runtime: GodotMcpRuntimeContext


func _init(context: GodotMcpEditingContext, runtime: GodotMcpRuntimeContext) -> void:
	_context = context
	_runtime = runtime


func execute(params: Dictionary) -> Variant:
	var target: Variant = GodotMcpParams.text(params, "scene", MAIN_TARGET)
	var watch_msec: Variant = GodotMcpParams.whole_number(params, "watch_ms", DEFAULT_WATCH_MSEC)
	var startup_timeout_msec: Variant = GodotMcpParams.whole_number(params, "startup_timeout_ms", DEFAULT_STARTUP_TIMEOUT_MSEC)
	var stop_after: Variant = GodotMcpParams.flag(params, "stop_after", false)
	var fixed_fps: Variant = GodotMcpParams.whole_number(params, "fixed_fps", 0)
	for value in [target, watch_msec, startup_timeout_msec, stop_after, fixed_fps]:
		if value is GodotMcpCommandError:
			return value
	if params.has("fixed_fps") and (fixed_fps < 1 or fixed_fps > MAXIMUM_FIXED_FPS):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"fixed_fps\" must be from 1 to %d" % MAXIMUM_FIXED_FPS, "Example: 60")
	var scene_path: Variant = _resolve_target(target)
	if scene_path is GodotMcpCommandError:
		return scene_path
	var launcher := _runtime.launcher
	var saved_scenes := PackedStringArray()
	var saved_scripts: Array = []
	if launcher.saves_before_running():
		var written_scripts: Variant = await _context.scripts.prepare_for_saving()
		if written_scripts is GodotMcpCommandError:
			return written_scripts
		saved_scripts = written_scripts
		saved_scenes = launcher.unsaved_scenes()
	if launcher.is_playing():
		launcher.stop()
		if not await GodotMcpWaiting.until(func() -> bool: return not launcher.is_playing(), STOP_TIMEOUT_MSEC):
			return GodotMcpCommandError.new(GodotMcpJsonRpc.TIMEOUT, "The running game did not stop within %d ms" % STOP_TIMEOUT_MSEC, "Stop it in the editor, then try again.")
	var game := _runtime.game
	var ready_count := game.ready_count
	var stop_count := game.stop_count
	var first_seq := _runtime.log_store.last_seq + 1
	var started_msec := Time.get_ticks_msec()
	game.request_agent_run(GodotMcpRunRequest.new(fixed_fps))
	_play(target, scene_path)
	await GodotMcpWaiting.until(func() -> bool: return game.ready_count != ready_count or game.stop_count != stop_count or game.state == GodotMcpGameState.PAUSED, startup_timeout_msec)
	var outcome := _outcome(ready_count, stop_count)
	var startup_msec := Time.get_ticks_msec() - started_msec
	if outcome == "ready":
		await GodotMcpWaiting.until(func() -> bool: return game.stop_count != stop_count, watch_msec)
		if stop_after and launcher.is_playing():
			launcher.stop()
			await GodotMcpWaiting.until(func() -> bool: return not launcher.is_playing() and game.stop_count != stop_count, STOP_TIMEOUT_MSEC)
	var page := _runtime.log_store.entries_after(first_seq - 1, PackedStringArray(), OUTPUT_LIMIT)
	return {
		"scene": game.scene if not game.scene.is_empty() else scene_path,
		"outcome": outcome,
		"state": game.state,
		"startup_ms": startup_msec,
		"output": page["entries"],
		"more_output": page["more"],
		"next_after": page["next_after"],
		"saved_scenes": Array(saved_scenes),
		"saved_scripts": saved_scripts,
	}


func _outcome(ready_count: int, stop_count: int) -> String:
	if _runtime.game.ready_count != ready_count:
		return "ready"
	if _runtime.game.stop_count != stop_count:
		return "stopped"
	if _runtime.game.state == GodotMcpGameState.PAUSED:
		return "paused"
	return "timeout"


func _play(target: String, scene_path: String) -> void:
	match target:
		MAIN_TARGET:
			_runtime.launcher.play_main_scene()
		CURRENT_TARGET:
			_runtime.launcher.play_current_scene()
		_:
			_runtime.launcher.play_scene(scene_path)


func _resolve_target(target: String) -> Variant:
	if target == MAIN_TARGET:
		return GodotMcpSceneResolver.main_scene_path()
	if target == CURRENT_TARGET:
		var edited_root := _context.scenes.access.edited_scene_root()
		if edited_root == null or edited_root.scene_file_path.is_empty():
			return GodotMcpCommandError.new(GodotMcpJsonRpc.NO_SCENE, "No saved scene is open in the editor", "Open one with scene_open, or run the main scene.")
		return edited_root.scene_file_path
	var path_error := GodotMcpSceneResolver.validate_scene_path(target)
	if path_error != null:
		return path_error
	if not ResourceLoader.exists(target):
		return GodotMcpSceneResolver.missing_scene_error(target)
	return target
