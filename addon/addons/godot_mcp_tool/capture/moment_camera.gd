extends RefCounted

const GodotMcpCaptureStore := preload("capture_store.gd")
const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpImageFitter := preload("image_fitter.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")
const GodotMcpScreenshotFile := preload("screenshot_file.gd")
const GodotMcpViewRenderer := preload("view_renderer.gd")
const GodotMcpViewRequests := preload("view_requests.gd")

const MAXIMUM_MOMENTS := 6
const CAPTURE_PREFIX := "moments"
const HEADLESS_DISPLAY := "headless"

var _store: GodotMcpCaptureStore


func _init(store: GodotMcpCaptureStore) -> void:
	_store = store


func grab() -> Variant:
	if DisplayServer.get_name() == HEADLESS_DISPLAY:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.OPERATION_FAILED,
			"The game runs without a window (headless), so it cannot render a screenshot",
			"A headless editor starts its games headless too; run the game from the Godot editor with a window.",
		)
	var window := (Engine.get_main_loop() as SceneTree).root
	await RenderingServer.frame_post_draw
	var image := window.get_texture().get_image()
	if image == null or image.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "The renderer returned an empty image", "Try again; if it keeps failing, read the errors with game_get_output.")
	return GodotMcpImageFitter.resized(image, Vector2i(window.get_visible_rect().size))


func save(images: Array, labels: PackedStringArray, options: Dictionary) -> Variant:
	var host := (Engine.get_main_loop() as SceneTree).root
	var cell := GodotMcpViewRequests.cell_size_for(images.size(), options["max_size"])
	var viewports: Array[SubViewport] = []
	for index in images.size():
		viewports.append(_labelled_viewport(images[index], labels[index], cell, host))
	await RenderingServer.frame_post_draw
	var labelled: Array = []
	for viewport in viewports:
		labelled.append(viewport.get_texture().get_image())
		viewport.queue_free()
	var sheet := GodotMcpImageFitter.contact_sheet(labelled, GodotMcpViewRequests.columns_for(images.size()), GodotMcpViewRequests.SHEET_GAP)
	var saved: Variant = GodotMcpScreenshotFile.write(sheet, options, _store, CAPTURE_PREFIX)
	if saved is GodotMcpCommandError:
		return saved
	saved["moments"] = Array(labels)
	return saved


static func _labelled_viewport(image: Image, label: String, cell: Vector2i, host: Node) -> SubViewport:
	var fitted := GodotMcpImageFitter.resized(image, _fitted_into(image.get_size(), cell))
	var viewport := SubViewport.new()
	viewport.size = fitted.get_size()
	viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
	var picture := TextureRect.new()
	picture.texture = ImageTexture.create_from_image(fitted)
	picture.size = Vector2(fitted.get_size())
	viewport.add_child(picture)
	viewport.add_child(GodotMcpViewRenderer.label_for(label, fitted.get_size()))
	host.add_child(viewport)
	return viewport


static func _fitted_into(size: Vector2i, box: Vector2i) -> Vector2i:
	var scale := minf(float(box.x) / size.x, float(box.y) / size.y)
	if scale >= 1.0:
		return size
	return Vector2i(maxi(1, roundi(size.x * scale)), maxi(1, roundi(size.y * scale)))
