extends RefCounted

const GodotMcpCanvasSizes := preload("canvas_sizes.gd")
const GodotMcpViewRenderer := preload("view_renderer.gd")

const CAPTION_LINES := 2

var _host: Node
var _draw_frame: Callable


func _init(host: Node, draw_frame: Callable) -> void:
	_host = host
	_draw_frame = draw_frame


func render(scene_root: Node, windows: Array) -> Array:
	var contents: Array[SubViewport] = []
	var captions: Array[SubViewport] = []
	for window in windows:
		contents.append(_open_content(scene_root, window))
		captions.append(_open_caption(window))
	await _host.get_tree().process_frame
	await _draw_frame.call()
	var images: Array = []
	for index in windows.size():
		var content := _framed(contents[index].get_texture().get_image(), windows[index])
		images.append(_captioned(content, captions[index].get_texture().get_image()))
		contents[index].queue_free()
		captions[index].queue_free()
	return images


func _open_content(scene_root: Node, window: Vector2i) -> SubViewport:
	var layout := GodotMcpCanvasSizes.project_layout_size_for(window)
	var viewport := SubViewport.new()
	viewport.size = GodotMcpCanvasSizes.project_content_size_for(window, layout)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	if layout != viewport.size:
		viewport.size_2d_override = layout
		viewport.size_2d_override_stretch = true
	viewport.add_child(detached_copy_of(scene_root))
	_host.add_child(viewport)
	return viewport


static func detached_copy_of(scene_root: Node) -> Node:
	var copy := scene_root.duplicate(Node.DUPLICATE_SIGNALS | Node.DUPLICATE_GROUPS | Node.DUPLICATE_SCRIPTS)
	copy.scene_file_path = ""
	return copy


func _open_caption(window: Vector2i) -> SubViewport:
	var label := GodotMcpViewRenderer.label_for(GodotMcpCanvasSizes.label_of(window), window)
	var caption := SubViewport.new()
	caption.size = Vector2i(window.x, label.get_theme_font_size(&"font_size") * CAPTION_LINES)
	caption.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	caption.add_child(label)
	_host.add_child(caption)
	return caption


static func _framed(content: Image, window: Vector2i) -> Image:
	if content.get_size() == window:
		return content
	var framed := Image.create_empty(window.x, window.y, false, Image.FORMAT_RGBA8)
	framed.fill(Color.BLACK)
	framed.blit_rect(_in_rgba(content), Rect2i(Vector2i.ZERO, content.get_size()), (window - content.get_size()) / 2)
	return framed


static func _captioned(content: Image, caption: Image) -> Image:
	var combined := Image.create_empty(content.get_width(), content.get_height() + caption.get_height(), false, Image.FORMAT_RGBA8)
	combined.blit_rect(_in_rgba(content), Rect2i(Vector2i.ZERO, content.get_size()), Vector2i.ZERO)
	combined.blit_rect(_in_rgba(caption), Rect2i(Vector2i.ZERO, caption.get_size()), Vector2i(0, content.get_height()))
	return combined


static func _in_rgba(image: Image) -> Image:
	if image.get_format() == Image.FORMAT_RGBA8:
		return image
	var converted := image.duplicate() as Image
	converted.convert(Image.FORMAT_RGBA8)
	return converted
