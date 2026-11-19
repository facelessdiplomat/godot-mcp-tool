extends "../../commands/command.gd"

const GodotMcpBoundsReport := preload("../../capture/bounds_report.gd")
const GodotMcpCaptureParams := preload("../../capture/capture_params.gd")
const GodotMcpCaptureStore := preload("../../capture/capture_store.gd")
const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpGameTime := preload("../game_time.gd")
const GodotMcpImageFitter := preload("../../capture/image_fitter.gd")
const GodotMcpMomentCamera := preload("../../capture/moment_camera.gd")
const GodotMcpParams := preload("../../commands/params.gd")
const GodotMcpScreenshotFile := preload("../../capture/screenshot_file.gd")
const GodotMcpViewMarkers := preload("../../capture/view_markers.gd")
const GodotMcpViewRenderer := preload("../../capture/view_renderer.gd")
const GodotMcpRenderModes := preload("../../capture/render_modes.gd")
const GodotMcpViewRequests := preload("../../capture/view_requests.gd")

const CAPTURE_PREFIX := "game"
const HEADLESS_DISPLAY := "headless"
const MINIMUM_FRAMES := 2
const DEFAULT_PHYSICS_FRAMES_APART := 5
const MAXIMUM_PHYSICS_FRAMES_APART := 600
const FRAME_LABEL := "frame %d"

var _scene: GodotMcpGameScene
var _store: GodotMcpCaptureStore
var _time: GodotMcpGameTime
var _moments: GodotMcpMomentCamera


func _init(scene: GodotMcpGameScene, capture_directory: String, time: GodotMcpGameTime, moments: GodotMcpMomentCamera) -> void:
	_scene = scene
	_store = GodotMcpCaptureStore.new(capture_directory)
	_time = time
	_moments = moments


func execute(params: Dictionary) -> Variant:
	var options: Variant = GodotMcpCaptureParams.read(params)
	if options is GodotMcpCommandError:
		return options
	if params.get("frames") != null:
		return await _frame_strip(params, options)
	var views: Variant = GodotMcpViewRequests.parse(options["views"], _bounds_of)
	if views is GodotMcpCommandError:
		return views
	var marked: Variant = GodotMcpViewMarkers.read(views, options["views"], _bounds_of, _children_of)
	if marked is GodotMcpCommandError:
		return marked
	var unrenderable := GodotMcpRenderModes.refusal_for(views, GodotMcpRenderModes.current_renderer(), true)
	if not unrenderable.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, unrenderable, "Render modes: %s; normals needs Forward+, and wireframe works in editor_screenshot only." % GodotMcpRenderModes.names())
	if DisplayServer.get_name() == HEADLESS_DISPLAY:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.OPERATION_FAILED,
			"The game runs without a window (headless), so it cannot render a screenshot",
			"A headless editor starts its games headless too; run the game from the Godot editor with a window.",
		)
	var tree := Engine.get_main_loop() as SceneTree
	var image: Image
	if (views as Array).is_empty():
		await RenderingServer.frame_post_draw
		image = _in_view_pixels(tree.root.get_texture().get_image(), tree.root)
	else:
		GodotMcpViewMarkers.place(views, GodotMcpViewRequests.cell_size_for((views as Array).size(), options["max_size"]))
		image = await GodotMcpViewRenderer.new(tree.root, _wait_for_drawn_frame).render_sheet(tree.root.find_world_3d(), views, options["max_size"])
	var saved: Variant = GodotMcpScreenshotFile.write(image, options, _store, CAPTURE_PREFIX)
	if saved is GodotMcpCommandError:
		return saved
	saved["scene"] = _scene.scene_path()
	saved["views"] = GodotMcpViewRequests.labels_of(views)
	var legend := GodotMcpViewMarkers.legend_of_capture(views, options["max_size"], saved)
	if not legend.is_empty():
		saved["markers"] = legend
	return saved


func _frame_strip(params: Dictionary, options: Dictionary) -> Variant:
	var count: Variant = GodotMcpParams.whole_number(params, "frames", MINIMUM_FRAMES)
	var apart: Variant = GodotMcpParams.whole_number(params, "every_physics_frames", DEFAULT_PHYSICS_FRAMES_APART)
	for value in [count, apart]:
		if value is GodotMcpCommandError:
			return value
	if count < MINIMUM_FRAMES or count > GodotMcpMomentCamera.MAXIMUM_MOMENTS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"frames\" must be from %d to %d" % [MINIMUM_FRAMES, GodotMcpMomentCamera.MAXIMUM_MOMENTS], "Take several strips for a longer moment.")
	if apart < 1 or apart > MAXIMUM_PHYSICS_FRAMES_APART:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"every_physics_frames\" must be from 1 to %d" % MAXIMUM_PHYSICS_FRAMES_APART)
	if not (options["views"] as Array).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "A strip of frames shows the game window, so it takes no views", "Take the frames and the views in two calls.")
	var images: Array = []
	var labels := PackedStringArray()
	var first_frame := _time.frames
	for index in count:
		if index > 0:
			var was_held := _time.let_run()
			for frame in apart:
				await _time.physics_frame_ended
			_time.hold_again_if(was_held)
		var image: Variant = await _moments.grab()
		if image is GodotMcpCommandError:
			return image
		images.append(image)
		labels.append(FRAME_LABEL % (_time.frames - first_frame))
	var saved: Variant = await _moments.save(images, labels, options)
	if saved is GodotMcpCommandError:
		return saved
	(saved as Dictionary).merge({"scene": _scene.scene_path(), "views": []})
	return saved


func _bounds_of(target: String) -> Variant:
	var resolved: Variant = _scene.resolve(target)
	if resolved is GodotMcpCommandError:
		return resolved
	return GodotMcpBoundsReport.framing_bounds(resolved, resolved == _scene.root())


func _children_of(target: String) -> Variant:
	var resolved: Variant = _scene.resolve(target)
	if resolved is GodotMcpCommandError:
		return resolved
	return (resolved as Node).get_children().filter(func(child: Node) -> bool: return child is Node3D).map(func(child: Node) -> String: return _scene.path_of(child))


static func _in_view_pixels(image: Image, window: Window) -> Image:
	if image == null or image.is_empty():
		return image
	return GodotMcpImageFitter.resized(image, Vector2i(window.get_visible_rect().size))


static func _wait_for_drawn_frame() -> void:
	await RenderingServer.frame_post_draw
