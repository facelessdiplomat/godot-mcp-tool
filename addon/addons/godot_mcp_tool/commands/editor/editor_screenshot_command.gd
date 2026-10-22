extends "../command.gd"

const BoundsReport := preload("../../capture/bounds_report.gd")
const CaptureParams := preload("../../capture/capture_params.gd")
const CaptureStore := preload("../../capture/capture_store.gd")
const EditingContext := preload("../../scene/editing_context.gd")
const EditorViewportAccess := preload("../../editor/editor_viewport_access.gd")
const ImageFitter := preload("../../capture/image_fitter.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const PreviewLighting := preload("../../capture/preview_lighting.gd")
const ScreenshotFile := preload("../../capture/screenshot_file.gd")
const ViewRequests := preload("../../capture/view_requests.gd")

const CAPTURE_PREFIX := "editor"
const HEADLESS_DISPLAY := "headless"

var _context: EditingContext
var _viewport: EditorViewportAccess
var _store: CaptureStore


func _init(context: EditingContext, viewport: EditorViewportAccess, capture_directory: String) -> void:
	_context = context
	_viewport = viewport
	_store = CaptureStore.new(capture_directory)


func execute(params: Dictionary) -> Variant:
	var options: Variant = CaptureParams.read(params)
	if options is CommandError:
		return options
	var resolved: Variant = _context.scenes.resolve_for_editing("")
	if resolved is CommandError:
		return resolved
	var scene_root := resolved as Node
	if scene_root is CanvasItem:
		return CommandError.new(
			JsonRpc.INVALID_PARAMS,
			"The scene open in the editor is not a 3D scene: its root \"%s\" is a %s" % [scene_root.name, NodeFactory.display_class(scene_root)],
			"See 2D scenes and UI in the running game with game_screenshot.",
		)
	var views: Variant = ViewRequests.parse(options["views"], _bounds_in.bind(scene_root))
	if views is CommandError:
		return views
	if DisplayServer.get_name() == HEADLESS_DISPLAY:
		return CommandError.new(
			JsonRpc.OPERATION_FAILED,
			"The editor runs without a window (headless), so it cannot render a screenshot",
			"Open the project in the Godot editor with a window.",
		)
	var renderer := _viewport.renderer()
	var image: Image
	if (views as Array).is_empty():
		views = [_viewport.camera_view()]
		var size := ImageFitter.fitted_size(_viewport.viewport_size(), options["max_size"])
		image = (await renderer.render(_viewport.world(), views, size, false))[0]
	else:
		image = await renderer.render_sheet(_viewport.world(), views, options["max_size"])
	var saved: Variant = ScreenshotFile.write(image, options, _store, CAPTURE_PREFIX)
	if saved is CommandError:
		return saved
	saved["scene"] = scene_root.scene_file_path
	saved["views"] = ViewRequests.labels_of(views)
	var note := PreviewLighting.note_for(scene_root)
	if not note.is_empty():
		saved["note"] = note
	return saved


static func _bounds_in(target: String, scene_root: Node) -> Variant:
	var node := NodeLocator.find(scene_root, target)
	if node == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % target, NodeLocator.not_found_hint(scene_root, target))
	return BoundsReport.framing_bounds(node, node == scene_root)
