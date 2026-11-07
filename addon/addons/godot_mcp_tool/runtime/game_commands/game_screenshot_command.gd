extends "../../commands/command.gd"

const GodotMcpBoundsReport := preload("../../capture/bounds_report.gd")
const GodotMcpCaptureParams := preload("../../capture/capture_params.gd")
const GodotMcpCaptureStore := preload("../../capture/capture_store.gd")
const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpImageFitter := preload("../../capture/image_fitter.gd")
const GodotMcpScreenshotFile := preload("../../capture/screenshot_file.gd")
const GodotMcpViewRenderer := preload("../../capture/view_renderer.gd")
const GodotMcpViewRequests := preload("../../capture/view_requests.gd")

const CAPTURE_PREFIX := "game"
const HEADLESS_DISPLAY := "headless"

var _scene: GodotMcpGameScene
var _store: GodotMcpCaptureStore


func _init(scene: GodotMcpGameScene, capture_directory: String) -> void:
	_scene = scene
	_store = GodotMcpCaptureStore.new(capture_directory)


func execute(params: Dictionary) -> Variant:
	var options: Variant = GodotMcpCaptureParams.read(params)
	if options is GodotMcpCommandError:
		return options
	var views: Variant = GodotMcpViewRequests.parse(options["views"], _bounds_of)
	if views is GodotMcpCommandError:
		return views
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
		image = await GodotMcpViewRenderer.new(tree.root, _wait_for_drawn_frame).render_sheet(tree.root.find_world_3d(), views, options["max_size"])
	var saved: Variant = GodotMcpScreenshotFile.write(image, options, _store, CAPTURE_PREFIX)
	if saved is GodotMcpCommandError:
		return saved
	saved["scene"] = _scene.scene_path()
	saved["views"] = GodotMcpViewRequests.labels_of(views)
	return saved


func _bounds_of(target: String) -> Variant:
	var resolved: Variant = _scene.resolve(target)
	if resolved is GodotMcpCommandError:
		return resolved
	return GodotMcpBoundsReport.framing_bounds(resolved, resolved == _scene.root())


static func _in_view_pixels(image: Image, window: Window) -> Image:
	if image == null or image.is_empty():
		return image
	return GodotMcpImageFitter.resized(image, Vector2i(window.get_visible_rect().size))


static func _wait_for_drawn_frame() -> void:
	await RenderingServer.frame_post_draw
