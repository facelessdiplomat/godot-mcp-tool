extends GutTest

const SimilarNames := preload("res://addons/godot_mcp_tool/util/similar_names.gd")


func test_suggests_names_that_share_most_letter_pairs() -> void:
	assert_eq(SimilarNames.find("positon", ["position", "rotation", "scale"]), PackedStringArray(["position"]))


func test_suggests_short_names_one_edit_away() -> void:
	assert_eq(SimilarNames.find("jmp", ["jump", "move_forward", "ui_accept"]), PackedStringArray(["jump"]))


func test_ignores_unrelated_names() -> void:
	assert_eq(SimilarNames.find("jmp", ["move_forward", "ui_accept", "crouch"]), PackedStringArray())


func test_puts_the_closest_names_first() -> void:
	assert_eq(SimilarNames.find("Playr", ["Player/Camera", "Player", "Plate"])[0], "Player")


func test_ignores_case() -> void:
	assert_eq(SimilarNames.find("PLAYER", ["Player"]), PackedStringArray(["Player"]))


func test_writes_a_hint_only_when_something_is_similar() -> void:
	assert_eq(SimilarNames.hint("jmp", ["jump"]), "Similar: jump.")
	assert_eq(SimilarNames.hint("jmp", ["crouch"]), "")
