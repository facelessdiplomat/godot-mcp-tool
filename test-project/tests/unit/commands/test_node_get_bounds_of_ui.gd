extends GutTest

const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpNodeGetBoundsCommand := preload("res://addons/godot_mcp_tool/commands/node/node_get_bounds_command.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")

var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _scratch_directory: String


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())
	_scratch_directory = "res://.godot/mcp_test_scratch/%d" % Time.get_ticks_usec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_scratch_directory))


func after_each() -> void:
	_history.dispose()
	_scenes.release()
	ScratchFolder.remove(ProjectSettings.globalize_path(_scratch_directory))


func _saved_hud() -> String:
	var hud := Control.new()
	hud.name = "Hud"
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	var health := ProgressBar.new()
	health.name = "Health"
	hud.add_child(health)
	health.owner = hud
	health.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	health.offset_left = -220
	health.offset_top = -50
	health.offset_right = -20
	health.offset_bottom = -20
	var packed := PackedScene.new()
	packed.pack(hud)
	hud.free()
	var path := _scratch_directory.path_join("hud.tscn")
	ResourceSaver.save(packed, path)
	return path


func test_lays_a_ui_scene_out_in_the_project_window_before_measuring_it() -> void:
	var path := _saved_hud()
	var health: Dictionary = await GodotMcpNodeGetBoundsCommand.new(_context, null).execute({"path": "Health", "scene": path})
	var hud: Dictionary = await GodotMcpNodeGetBoundsCommand.new(_context, null).execute({"path": ".", "scene": path})
	assert_eq(health["position"], "Vector2(932, 598)")
	assert_eq(health["size"], "Vector2(200, 30)")
	assert_eq(health["inside_window"], true)
	assert_eq(hud["size"], "Vector2(1152, 648)")
	assert_eq(hud["type"], "Control")
