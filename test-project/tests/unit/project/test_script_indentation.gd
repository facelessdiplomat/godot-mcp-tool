extends GutTest

const ScriptIndentation := preload("res://addons/godot_mcp_tool/project/script_indentation.gd")


func test_finds_tabs_in_scripts_indented_with_tabs() -> void:
	var scripts := ["extends Node\n\n\nfunc _ready() -> void:\n\tif true:\n\t\tprint(1)\n"]
	assert_eq(ScriptIndentation.of_texts(scripts), {"style": "tabs", "size": 4})


func test_finds_the_width_of_indentation_with_spaces() -> void:
	var scripts := [
		"extends Node\n\n\nfunc _ready() -> void:\n  if true:\n    print(1)\n",
		"extends Node\n\n\nfunc _process(_delta: float) -> void:\n  pass\n",
	]
	assert_eq(ScriptIndentation.of_texts(scripts), {"style": "spaces", "size": 2})


func test_follows_the_style_of_most_lines() -> void:
	var scripts := ["func a() -> void:\n\tpass\n\tpass\n", "func b() -> void:\n    pass\n"]
	assert_eq(ScriptIndentation.of_texts(scripts)["style"], "tabs")


func test_assumes_the_tabs_of_godot_without_indented_lines() -> void:
	assert_eq(ScriptIndentation.of_texts([]), {"style": "tabs", "size": 4})
