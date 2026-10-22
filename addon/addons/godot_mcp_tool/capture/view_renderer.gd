extends RefCounted

const ImageFitter := preload("image_fitter.gd")
const ViewRequests := preload("view_requests.gd")

const LABEL_FONT_SHARE := 1.0 / 24.0
const MINIMUM_LABEL_FONT_SIZE := 14
const MINIMUM_LABEL_OUTLINE := 2

var _host: Node
var _draw_frame: Callable


func _init(host: Node, draw_frame: Callable) -> void:
	_host = host
	_draw_frame = draw_frame


func render_sheet(world: World3D, views: Array, max_size: int) -> Image:
	var images: Array = await render(world, views, ViewRequests.cell_size_for(views.size(), max_size), true)
	return ImageFitter.contact_sheet(images, ViewRequests.columns_for(views.size()), ViewRequests.SHEET_GAP)


func render(world: World3D, views: Array, size: Vector2i, labelled: bool) -> Array:
	var viewports: Array[SubViewport] = []
	for view in views:
		viewports.append(_open_viewport(world, view, size, labelled))
	await _draw_frame.call()
	var images: Array = []
	for viewport in viewports:
		images.append(viewport.get_texture().get_image())
		viewport.queue_free()
	return images


func _open_viewport(world: World3D, view: Dictionary, size: Vector2i, labelled: bool) -> SubViewport:
	var viewport := SubViewport.new()
	viewport.size = size
	viewport.world_3d = world
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	var camera := Camera3D.new()
	camera.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	camera.fov = view["fov"]
	if view.has("orthogonal_size"):
		camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		camera.size = view["orthogonal_size"]
	camera.transform = view["transform"]
	viewport.add_child(camera)
	if labelled:
		viewport.add_child(_label(view["label"], size))
	_host.add_child(viewport)
	camera.make_current()
	camera.force_update_transform()
	RenderingServer.camera_set_transform(camera.get_camera_rid(), camera.global_transform)
	return viewport


static func _label(text: String, cell_size: Vector2i) -> Label:
	var font_size := maxi(MINIMUM_LABEL_FONT_SIZE, roundi(cell_size.y * LABEL_FONT_SHARE))
	var label := Label.new()
	label.text = text
	label.position = Vector2.ONE * roundi(font_size / 2.0)
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.add_theme_color_override("font_outline_color", Color.BLACK)
	label.add_theme_constant_override("outline_size", maxi(MINIMUM_LABEL_OUTLINE, roundi(font_size / 4.0)))
	return label
