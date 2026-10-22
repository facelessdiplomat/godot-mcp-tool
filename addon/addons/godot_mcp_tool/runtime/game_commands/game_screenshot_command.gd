extends "../../commands/command.gd"

const BoundsReport := preload("../../capture/bounds_report.gd")
const CaptureParams := preload("../../capture/capture_params.gd")
const CaptureStore := preload("../../capture/capture_store.gd")
const GameScene := preload("game_scene.gd")
const ImageFitter := preload("../../capture/image_fitter.gd")
const ScreenshotFile := preload("../../capture/screenshot_file.gd")
const ViewRenderer := preload("../../capture/view_renderer.gd")
const ViewRequests := preload("../../capture/view_requests.gd")

const CAPTURE_PREFIX := "game"
const HEADLESS_DISPLAY := "headless"

var _scene: GameScene
var _store: CaptureStore


func _init(scene: GameScene, capture_directory: String) -> void:
	_scene = scene
	_store = CaptureStore.new(capture_directory)


func execute(params: Dictionary) -> Variant:
	var options: Variant = CaptureParams.read(params)
	if options is CommandError:
		return options
	var views: Variant = ViewRequests.parse(options["views"], _bounds_of)
	if views is CommandError:
		return views
	if DisplayServer.get_name() == HEADLESS_DISPLAY:
		return CommandError.new(
			JsonRpc.OPERATION_FAILED,
			"The game runs without a window (headless), so it cannot render a screenshot",
			"A headless editor starts its games headless too; run the game from the Godot editor with a window.",
		)
	var tree := Engine.get_main_loop() as SceneTree
	var image: Image
	if (views as Array).is_empty():
		await RenderingServer.frame_post_draw
		image = _in_view_pixels(tree.root.get_texture().get_image(), tree.root)
	else:
		image = await ViewRenderer.new(tree.root, _wait_for_drawn_frame).render_sheet(tree.root.find_world_3d(), views, options["max_size"])
	var saved: Variant = ScreenshotFile.write(image, options, _store, CAPTURE_PREFIX)
	if saved is CommandError:
		return saved
	saved["scene"] = _scene.scene_path()
	saved["views"] = ViewRequests.labels_of(views)
	return saved


func _bounds_of(target: String) -> Variant:
	var resolved: Variant = _scene.resolve(target)
	if resolved is CommandError:
		return resolved
	return BoundsReport.framing_bounds(resolved, resolved == _scene.root())


static func _in_view_pixels(image: Image, window: Window) -> Image:
	if image == null or image.is_empty():
		return image
	return ImageFitter.resized(image, Vector2i(window.get_visible_rect().size))


static func _wait_for_drawn_frame() -> void:
	await RenderingServer.frame_post_draw
