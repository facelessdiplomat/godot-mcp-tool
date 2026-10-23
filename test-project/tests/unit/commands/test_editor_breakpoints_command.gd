extends GutTest

const EditorBreakpointsCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_breakpoints_command.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")


func test_lists_the_breakpoints_of_the_script_editor() -> void:
	var scripts := FakeScriptEditorAccess.new()
	scripts.breakpoint_lines = PackedStringArray(["res://player.gd:12", "res://enemy.gd:7"])
	var result: Dictionary = await EditorBreakpointsCommand.new(scripts).execute({})
	assert_eq(result["breakpoints"], PackedStringArray(["res://player.gd:12", "res://enemy.gd:7"]))
