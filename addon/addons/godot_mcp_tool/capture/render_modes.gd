extends RefCounted

const MODES := {
	"unshaded": Viewport.DEBUG_DRAW_UNSHADED,
	"lighting": Viewport.DEBUG_DRAW_LIGHTING,
	"overdraw": Viewport.DEBUG_DRAW_OVERDRAW,
	"wireframe": Viewport.DEBUG_DRAW_WIREFRAME,
	"normals": Viewport.DEBUG_DRAW_NORMAL_BUFFER,
}
const RENDERER_NAMES := {"forward_plus": "Forward+", "mobile": "Mobile", "gl_compatibility": "Compatibility"}
const NORMAL_BUFFER_RENDERER := "forward_plus"
const RENDERER_SETTING := "rendering/renderer/rendering_method"


static func current_renderer() -> String:
	var method := RenderingServer.get_current_rendering_method()
	return method if RENDERER_NAMES.has(method) else str(ProjectSettings.get_setting(RENDERER_SETTING, NORMAL_BUFFER_RENDERER))


static func names() -> String:
	return ", ".join(PackedStringArray(MODES.keys()))


static func refusal(mode: String, renderer: String, in_game: bool) -> String:
	if mode == "normals" and renderer != NORMAL_BUFFER_RENDERER:
		return "normals needs the Forward+ renderer, and this project renders with %s" % RENDERER_NAMES.get(renderer, renderer)
	if mode == "wireframe" and in_game:
		return "the running game keeps no wireframes of the meshes it loaded, so it cannot draw them; take the wireframe view of the scene with editor_screenshot"
	return ""


static func refusal_for(views: Array, renderer: String, in_game: bool) -> String:
	for index in views.size():
		var view: Dictionary = views[index]
		var reason := refusal(str(view.get("render", "")), renderer, in_game)
		if not reason.is_empty():
			return "View %d (%s): %s" % [index + 1, view["label"], reason]
	return ""
