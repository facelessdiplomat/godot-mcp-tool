extends GutTest

const GodotMcpIndefiniteArticle := preload("res://addons/godot_mcp_tool/util/indefinite_article.gd")


func test_puts_an_before_a_vowel_and_a_before_other_letters() -> void:
	assert_eq(GodotMcpIndefiniteArticle.before("AnimationPlayer"), "an AnimationPlayer")
	assert_eq(GodotMcpIndefiniteArticle.before("Area3D"), "an Area3D")
	assert_eq(GodotMcpIndefiniteArticle.before("Node3D"), "a Node3D")
	assert_eq(GodotMcpIndefiniteArticle.before("StaticBody3D"), "a StaticBody3D")
