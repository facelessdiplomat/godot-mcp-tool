extends GutTest

const GodotMcpRenderModes := preload("res://addons/godot_mcp_tool/capture/render_modes.gd")


func test_lets_every_mode_through_on_forward_plus_in_the_editor() -> void:
	for mode: String in GodotMcpRenderModes.MODES:
		assert_eq(GodotMcpRenderModes.refusal(mode, "forward_plus", false), "", mode)


func test_refuses_normals_on_renderers_without_a_normal_buffer() -> void:
	assert_eq(GodotMcpRenderModes.refusal("normals", "mobile", false), "normals needs the Forward+ renderer, and this project renders with Mobile")
	assert_eq(GodotMcpRenderModes.refusal("normals", "gl_compatibility", true), "normals needs the Forward+ renderer, and this project renders with Compatibility")
	assert_eq(GodotMcpRenderModes.refusal("overdraw", "gl_compatibility", true), "")


func test_refuses_wireframes_of_the_running_game() -> void:
	assert_string_contains(GodotMcpRenderModes.refusal("wireframe", "forward_plus", true), "editor_screenshot")
	assert_eq(GodotMcpRenderModes.refusal("wireframe", "forward_plus", false), "")


func test_finds_the_first_view_whose_mode_cannot_render() -> void:
	var views := [{"label": "iso", "render": ""}, {"label": "top, normals", "render": "normals"}]
	assert_eq(GodotMcpRenderModes.refusal_for(views, "mobile", false), "View 2 (top, normals): normals needs the Forward+ renderer, and this project renders with Mobile")
	assert_eq(GodotMcpRenderModes.refusal_for(views, "forward_plus", false), "")


func test_takes_the_renderer_of_the_project_where_nothing_renders() -> void:
	assert_true(GodotMcpRenderModes.current_renderer() in ["forward_plus", "mobile", "gl_compatibility"])
