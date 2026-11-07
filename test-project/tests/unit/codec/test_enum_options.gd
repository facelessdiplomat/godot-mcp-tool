extends GutTest

const GodotMcpEnumOptions := preload("res://addons/godot_mcp_tool/codec/enum_options.gd")


func test_numbers_options_in_order() -> void:
	assert_eq(GodotMcpEnumOptions.parse("Off,On,Double-Sided"), [
		{"name": "Off", "value": 0},
		{"name": "On", "value": 1},
		{"name": "Double-Sided", "value": 2},
	])


func test_keeps_explicit_values_and_continues_after_them() -> void:
	assert_eq(GodotMcpEnumOptions.parse("Walk:1,Run:4,Sprint"), [
		{"name": "Walk", "value": 1},
		{"name": "Run", "value": 4},
		{"name": "Sprint", "value": 5},
	])


func test_trims_spaces_and_skips_empty_entries() -> void:
	assert_eq(GodotMcpEnumOptions.parse(" Small , Large : 5 ,"), [
		{"name": "Small", "value": 0},
		{"name": "Large", "value": 5},
	])


func test_finds_the_name_of_a_value() -> void:
	var options := GodotMcpEnumOptions.parse("Walk:1,Run:4")
	assert_eq(GodotMcpEnumOptions.name_of(options, 4), "Run")
	assert_eq(GodotMcpEnumOptions.name_of(options, 2), "")
