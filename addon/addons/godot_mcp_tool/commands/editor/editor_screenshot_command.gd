extends "../command.gd"

const GodotMcpBoundsReport := preload("../../capture/bounds_report.gd")
const GodotMcpCaptureParams := preload("../../capture/capture_params.gd")
const GodotMcpCaptureStore := preload("../../capture/capture_store.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpEditorViewportAccess := preload("../../editor/editor_viewport_access.gd")
const GodotMcpImageFitter := preload("../../capture/image_fitter.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpPreviewLighting := preload("../../capture/preview_lighting.gd")
const GodotMcpScreenshotFile := preload("../../capture/screenshot_file.gd")
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
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.INVALID_PARAMS,
			"The scene open in the editor is not a 3D scene: its root \"%s\" is a %s" % [scene_root.name, GodotMcpNodeFactory.display_class(scene_root)],
			"See 2D scenes and UI in the running game with game_screenshot.",
		)
	var views: Variant = GodotMcpViewRequests.parse(options["views"], _bounds_in.bind(scene_root))
	if views is GodotMcpCommandError:
		return views
	if DisplayServer.get_name() == HEADLESS_DISPLAY:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.OPERATION_FAILED,
			"The editor runs without a window (headless), so it cannot render a screenshot",
			"Open the project in the Godot editor with a window.",
		)
	var renderer := _viewport.renderer()
	var image: Image
	if (views as Array).is_empty():
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
	var note := GodotMcpPreviewLighting.note_for(scene_root)
	if not note.is_empty():
		saved["note"] = note
	return saved


static func _bounds_in(target: String, scene_root: Node) -> Variant:
	var node := GodotMcpNodeLocator.find(scene_root, target)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % target, GodotMcpNodeLocator.not_found_hint(scene_root, target))
	return GodotMcpBoundsReport.framing_bounds(node, node == scene_root)
