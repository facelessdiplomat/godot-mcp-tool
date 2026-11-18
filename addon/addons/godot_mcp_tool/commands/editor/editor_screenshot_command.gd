extends "../command.gd"

const GodotMcpAnimationPose := preload("../../animation/animation_pose.gd")
const GodotMcpBoundsReport := preload("../../capture/bounds_report.gd")
const GodotMcpCanvasSizes := preload("../../capture/canvas_sizes.gd")
const GodotMcpCaptureParams := preload("../../capture/capture_params.gd")
const GodotMcpCaptureStore := preload("../../capture/capture_store.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpEditorViewportAccess := preload("../../editor/editor_viewport_access.gd")
const GodotMcpImageFitter := preload("../../capture/image_fitter.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpPoseRequest := preload("../../capture/pose_request.gd")
const GodotMcpPreviewLighting := preload("../../capture/preview_lighting.gd")
const GodotMcpScreenshotFile := preload("../../capture/screenshot_file.gd")
const GodotMcpViewRenderer := preload("../../capture/view_renderer.gd")
const GodotMcpViewRequests := preload("../../capture/view_requests.gd")

const CAPTURE_PREFIX := "editor"
const HEADLESS_DISPLAY := "headless"

var _context: GodotMcpEditingContext
var _viewport: GodotMcpEditorViewportAccess
var _store: GodotMcpCaptureStore


func _init(context: GodotMcpEditingContext, viewport: GodotMcpEditorViewportAccess, capture_directory: String) -> void:
	_context = context
	_viewport = viewport
	_store = GodotMcpCaptureStore.new(capture_directory)


func execute(params: Dictionary) -> Variant:
	var options: Variant = GodotMcpCaptureParams.read(params)
	if options is GodotMcpCommandError:
		return options
	var resolved: Variant = _context.scenes.resolve_for_editing("")
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	if scene_root is CanvasItem:
		return await _render_canvas_scene(scene_root, params, options)
	if params.get("sizes") != null:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.INVALID_PARAMS,
			"\"sizes\" is for UI and 2D scenes; the scene open in the editor is a 3D scene",
			"Render a 3D scene from given angles with views, such as [\"front\", \"top\", \"iso\"].",
		)
	var views: Variant = GodotMcpViewRequests.parse(options["views"], _bounds_in.bind(scene_root))
	if views is GodotMcpCommandError:
		return views
	var poses: Variant = null
	if params.get("animation") != null:
		poses = GodotMcpPoseRequest.parse(params["animation"], scene_root)
		if poses is GodotMcpCommandError:
			return poses
		if (views as Array).size() > 1:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "With animation, give at most one view: the image shows that view once for every time", "Example: {\"views\": [\"front\"], \"animation\": {\"player\": \"AnimationPlayer\", \"name\": \"walk\"}}")
	if DisplayServer.get_name() == HEADLESS_DISPLAY:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.OPERATION_FAILED,
			"The editor runs without a window (headless), so it cannot render a screenshot",
			"Open the project in the Godot editor with a window.",
		)
	var renderer := _viewport.renderer()
	var image: Image
	if poses != null:
		if (views as Array).is_empty():
			views = [_viewport.camera_view()]
		image = await _render_poses(renderer, poses, (views as Array).front(), options["max_size"])
	elif (views as Array).is_empty():
		views = [_viewport.camera_view()]
		var size := GodotMcpImageFitter.fitted_size(_viewport.viewport_size(), options["max_size"])
		image = (await renderer.render(_viewport.world(), views, size, false))[0]
	else:
		image = await renderer.render_sheet(_viewport.world(), views, options["max_size"])
	var saved: Variant = GodotMcpScreenshotFile.write(image, options, _store, CAPTURE_PREFIX)
	if saved is GodotMcpCommandError:
		return saved
	saved["scene"] = scene_root.scene_file_path
	saved["views"] = GodotMcpViewRequests.labels_of(views)
	if poses != null:
		saved["moments"] = _pose_labels(poses)
	var note := GodotMcpPreviewLighting.note_for(scene_root)
	if not note.is_empty():
		saved["note"] = note
	return saved


func _render_canvas_scene(scene_root: Node, params: Dictionary, options: Dictionary) -> Variant:
	if not (options["views"] as Array).is_empty() or params.get("animation") != null:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.INVALID_PARAMS,
			"The scene open in the editor is a UI or 2D scene (its root \"%s\" is a %s): it takes sizes, not views or animation" % [scene_root.name, GodotMcpNodeFactory.display_class(scene_root)],
			GodotMcpCanvasSizes.EXAMPLE,
		)
	var sizes: Variant = GodotMcpCanvasSizes.parse(params.get("sizes"))
	if sizes is GodotMcpCommandError:
		return sizes
	if DisplayServer.get_name() == HEADLESS_DISPLAY:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.OPERATION_FAILED,
			"The editor runs without a window (headless), so it cannot render a screenshot",
			"Open the project in the Godot editor with a window.",
		)
	var images: Array = await _viewport.canvas_renderer().render(scene_root, sizes)
	var sheet := GodotMcpImageFitter.contact_sheet(images, GodotMcpViewRequests.columns_for(images.size()), GodotMcpViewRequests.SHEET_GAP)
	var saved: Variant = GodotMcpScreenshotFile.write(sheet, options, _store, CAPTURE_PREFIX)
	if saved is GodotMcpCommandError:
		return saved
	saved["scene"] = scene_root.scene_file_path
	saved["views"] = []
	saved["sizes"] = (sizes as Array).map(func(size: Vector2i) -> String: return GodotMcpCanvasSizes.label_of(size))
	return saved


func _render_poses(renderer: GodotMcpViewRenderer, poses: Dictionary, view: Dictionary, max_size: int) -> Image:
	var times: Array = poses["times"]
	var cell_size := GodotMcpViewRequests.cell_size_for(times.size(), max_size)
	var labels := _pose_labels(poses)
	var pose := GodotMcpAnimationPose.new(poses["player"], poses["animation"])
	var images: Array = []
	for index in times.size():
		pose.pose_at(times[index])
		var labelled_view := view.duplicate()
		labelled_view["label"] = labels[index]
		images.append((await renderer.render(_viewport.world(), [labelled_view], cell_size, true))[0])
	pose.restore()
	return GodotMcpImageFitter.contact_sheet(images, GodotMcpViewRequests.columns_for(times.size()), GodotMcpViewRequests.SHEET_GAP)


static func _pose_labels(poses: Dictionary) -> Array:
	return (poses["times"] as Array).map(func(time: float) -> String: return GodotMcpPoseRequest.label_of(poses["name"], time))


static func _bounds_in(target: String, scene_root: Node) -> Variant:
	var node := GodotMcpNodeLocator.find(scene_root, target)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % target, GodotMcpNodeLocator.not_found_hint(scene_root, target))
	return GodotMcpBoundsReport.framing_bounds(node, node == scene_root)
