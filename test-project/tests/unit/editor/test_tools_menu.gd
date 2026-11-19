extends GutTest

const GodotMcpChangesHoldSwitch := preload("res://addons/godot_mcp_tool/editor/changes_hold_switch.gd")
const GodotMcpToolsMenu := preload("res://addons/godot_mcp_tool/editor/tools_menu.gd")

var _unsafe_allowed := false
var _menu: GodotMcpToolsMenu


func before_each() -> void:
	_unsafe_allowed = false
	_menu = GodotMcpToolsMenu.new()


func after_each() -> void:
	_menu.free_menu()


func test_lists_a_check_item_for_each_switch() -> void:
	var hold := GodotMcpChangesHoldSwitch.new()
	_menu.add_switch("Allow Unsafe Tools in This Project", func() -> bool: return _unsafe_allowed, func(allowed: bool) -> void: _unsafe_allowed = allowed)
	_menu.add_switch(GodotMcpChangesHoldSwitch.ITEM_TEXT, hold.is_held, hold.set_held)
	var popup := _menu.popup_menu()
	assert_eq(popup.item_count, 2)
	assert_eq(popup.get_item_text(1), "Hold Changes")
	assert_true(popup.is_item_checkable(1))


func test_toggles_a_switch_when_its_item_is_pressed() -> void:
	var hold := GodotMcpChangesHoldSwitch.new()
	_menu.add_switch(GodotMcpChangesHoldSwitch.ITEM_TEXT, hold.is_held, hold.set_held)
	var popup := _menu.popup_menu()
	popup.id_pressed.emit(popup.get_item_id(0))
	assert_true(hold.is_held())
	assert_true(popup.is_item_checked(0))
	popup.id_pressed.emit(popup.get_item_id(0))
	assert_false(hold.is_held())


func test_shows_a_change_made_elsewhere_before_the_menu_opens() -> void:
	_menu.add_switch("Allow Unsafe Tools in This Project", func() -> bool: return _unsafe_allowed, func(allowed: bool) -> void: _unsafe_allowed = allowed)
	var popup := _menu.popup_menu()
	_unsafe_allowed = true
	popup.about_to_popup.emit()
	assert_true(popup.is_item_checked(0))


func test_holds_no_changes_when_the_editor_starts() -> void:
	assert_false(GodotMcpChangesHoldSwitch.new().is_held())
