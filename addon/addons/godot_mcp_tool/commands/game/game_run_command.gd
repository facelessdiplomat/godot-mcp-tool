extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const Params := preload("../params.gd")
const RunRequest := preload("../../runtime/run_request.gd")
const RuntimeContext := preload("../../runtime/runtime_context.gd")
const SceneResolver := preload("../../scene/scene_resolver.gd")
const Waiting := preload("../../util/waiting.gd")

const MAIN_SCENE_SETTING := "application/run/main_scene"
const MAIN_TARGET := "main"
const CURRENT_TARGET := "current"
const DEFAULT_WATCH_MSEC := 1000
const DEFAULT_STARTUP_TIMEOUT_MSEC := 30_000
const STOP_TIMEOUT_MSEC := 10_000
const OUTPUT_LIMIT := 60
const MAXIMUM_FIXED_FPS := 1000

var _context: EditingContext
var _runtime: RuntimeContext


func _init(context: EditingContext, runtime: RuntimeContext) -> void:
	_context = context
	_runtime = runtime


func execute(params: Dictionary) -> Variant:
	var target: Variant = Params.text(params, "scene", MAIN_TARGET)
	var watch_msec: Variant = Params.whole_number(params, "watch_ms", DEFAULT_WATCH_MSEC)
	var startup_timeout_msec: Variant = Params.whole_number(params, "startup_timeout_ms", DEFAULT_STARTUP_TIMEOUT_MSEC)
	var stop_after: Variant = Params.flag(params, "stop_after", false)
	var fixed_fps: Variant = Params.whole_number(params, "fixed_fps", 0)
	for value in [target, watch_msec, startup_timeout_msec, stop_after, fixed_fps]:
		if value is CommandError:
			return value
	if params.has("fixed_fps") and (fixed_fps < 1 or fixed_fps > MAXIMUM_FIXED_FPS):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"fixed_fps\" must be from 1 to %d" % MAXIMUM_FIXED_FPS, "Example: 60")
	var scene_path: Variant = _resolve_target(target)
	if scene_path is CommandError:
		return scene_path
	var launcher := _runtime.launcher
	var saved_scenes := PackedStringArray()
	var saved_scripts: Array = []
	if launcher.saves_before_running():
		var written_scripts: Variant = await _context.scripts.prepare_for_saving()
		if written_scripts is CommandError:
			return written_scripts
		saved_scripts = written_scripts
		saved_scenes = launcher.unsaved_scenes()
	if launcher.is_playing():
		launcher.stop()
		if not await Waiting.until(func() -> bool: return not launcher.is_playing(), STOP_TIMEOUT_MSEC):
			return CommandError.new(JsonRpc.TIMEOUT, "The running game did not stop within %d ms" % STOP_TIMEOUT_MSEC, "Stop it in the editor, then try again.")
	var game := _runtime.game
	var ready_count := game.ready_count
	var stop_count := game.stop_count
	var first_seq := _runtime.log_store.last_seq + 1
	var started_msec := Time.get_ticks_msec()
	game.request_agent_run(RunRequest.new(fixed_fps))
	_play(target, scene_path)
	await Waiting.until(func() -> bool: return game.ready_count != ready_count or game.stop_count != stop_count, startup_timeout_msec)
	var outcome := _outcome(ready_count, stop_count)
	var startup_msec := Time.get_ticks_msec() - started_msec
	if outcome == "ready":
		await Waiting.until(func() -> bool: return game.stop_count != stop_count, watch_msec)
		if stop_after and launcher.is_playing():
			launcher.stop()
			await Waiting.until(func() -> bool: return not launcher.is_playing() and game.stop_count != stop_count, STOP_TIMEOUT_MSEC)
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
		var main_scene := str(ProjectSettings.get_setting(MAIN_SCENE_SETTING, ""))
		if main_scene.is_empty():
			return CommandError.new(JsonRpc.INVALID_PARAMS, "The project has no main scene", "Set application/run/main_scene with project_settings_set, or pass the scene to run.")
		var main_scene_path := ResourceUID.ensure_path(main_scene)
		if not ResourceLoader.exists(main_scene_path):
			return CommandError.new(JsonRpc.NOT_FOUND, "The main scene %s does not exist" % main_scene_path, "Point application/run/main_scene at an existing scene with project_settings_set.")
		return main_scene_path
	if target == CURRENT_TARGET:
		var edited_root := _context.scenes.access.edited_scene_root()
		if edited_root == null or edited_root.scene_file_path.is_empty():
			return CommandError.new(JsonRpc.NO_SCENE, "No saved scene is open in the editor", "Open one with scene_open, or run the main scene.")
		return edited_root.scene_file_path
	var path_error := SceneResolver.validate_scene_path(target)
	if path_error != null:
		return path_error
	if not ResourceLoader.exists(target):
		return SceneResolver.missing_scene_error(target)
	return target
