extends GutTest

const IndefiniteArticle := preload("res://addons/godot_mcp_tool/util/indefinite_article.gd")


func test_puts_an_before_a_vowel_and_a_before_other_letters() -> void:
	assert_eq(IndefiniteArticle.before("AnimationPlayer"), "an AnimationPlayer")
	assert_eq(IndefiniteArticle.before("Area3D"), "an Area3D")
	assert_eq(IndefiniteArticle.before("Node3D"), "a Node3D")
	assert_eq(IndefiniteArticle.before("StaticBody3D"), "a StaticBody3D")
