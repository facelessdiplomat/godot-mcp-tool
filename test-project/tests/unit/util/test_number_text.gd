extends GutTest

const GodotMcpNumberText := preload("res://addons/godot_mcp_tool/util/number_text.gd")


func test_writes_whole_numbers_without_decimals() -> void:
	assert_eq(GodotMcpNumberText.of(15.0, 3), "15")
	assert_eq(GodotMcpNumberText.of(-2.0, 2), "-2")


func test_rounds_other_numbers_to_the_given_decimals() -> void:
	assert_eq(GodotMcpNumberText.of(0.1, 3), "0.1")
	assert_eq(GodotMcpNumberText.of(0.125, 3), "0.125")
	assert_eq(GodotMcpNumberText.of(1.23456, 2), "1.23")
