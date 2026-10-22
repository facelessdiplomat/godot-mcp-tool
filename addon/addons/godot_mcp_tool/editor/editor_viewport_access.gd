extends RefCounted

const ViewRenderer := preload("../capture/view_renderer.gd")

const MAIN_VIEWPORT := 0
const EDITOR_CAMERA_LABEL := "editor camera"
const FALLBACK_SIZE := Vector2i(1280, 720)


func world() -> World3D:
	return EditorInterface.get_editor_viewport_3d(MAIN_VIEWPORT).find_world_3d()


func camera_view() -> Dictionary:
	var camera := EditorInterface.get_editor_viewport_3d(MAIN_VIEWPORT).get_camera_3d()
	var view := {"label": EDITOR_CAMERA_LABEL, "transform": camera.global_transform, "fov": camera.fov}
	if camera.projection == Camera3D.PROJECTION_ORTHOGONAL:
		view["orthogonal_size"] = camera.size
	return view


func viewport_size() -> Vector2i:
	var size := EditorInterface.get_editor_viewport_3d(MAIN_VIEWPORT).size
	return size if size.x > 0 and size.y > 0 else FALLBACK_SIZE


func renderer() -> ViewRenderer:
	return ViewRenderer.new(EditorInterface.get_base_control(), _draw_now)


static func _draw_now() -> void:
	await EditorInterface.get_base_control().get_tree().process_frame
	RenderingServer.force_draw(false)
