extends GutTest

const GodotMcpEditorReloadExtensionsCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_reload_extensions_command.gd")
const FakeExtensionAccess := preload("res://tests/support/fake_extension_access.gd")


func test_asks_the_editor_to_reload_rebuilt_extensions_and_answers_at_once() -> void:
	var extensions := FakeExtensionAccess.new()
	var command := GodotMcpEditorReloadExtensionsCommand.new(extensions)
	var outcome: Variant = command.execute({})
	assert_eq(extensions.reload_requests, 1)
	assert_eq(outcome, {})
