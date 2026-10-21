extends GutTest

const TokenGenerator := preload("res://addons/godot_mcp_tool/bridge/token_generator.gd")


func test_generates_128_random_bits_as_base64() -> void:
	var token := TokenGenerator.generate()
	assert_eq(token.length(), 24)
	assert_eq(Marshalls.base64_to_raw(token).size(), 16)


func test_generates_a_different_token_each_time() -> void:
	assert_ne(TokenGenerator.generate(), TokenGenerator.generate())
