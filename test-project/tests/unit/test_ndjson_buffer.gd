extends GutTest

const NdjsonBuffer := preload("res://addons/godot_mcp_tool/bridge/ndjson_buffer.gd")


func test_returns_a_complete_line() -> void:
	var buffer := NdjsonBuffer.new()
	buffer.append('{"id":1}\n'.to_utf8_buffer())
	assert_eq(buffer.take_lines(), PackedStringArray(['{"id":1}']))


func test_returns_several_lines_from_one_chunk() -> void:
	var buffer := NdjsonBuffer.new()
	buffer.append('{"id":1}\n{"id":2}\n'.to_utf8_buffer())
	assert_eq(buffer.take_lines(), PackedStringArray(['{"id":1}', '{"id":2}']))


func test_keeps_an_incomplete_line_until_the_rest_arrives() -> void:
	var buffer := NdjsonBuffer.new()
	buffer.append('{"id":'.to_utf8_buffer())
	assert_eq(buffer.take_lines().size(), 0)
	buffer.append('3}\n'.to_utf8_buffer())
	assert_eq(buffer.take_lines(), PackedStringArray(['{"id":3}']))


func test_joins_a_multibyte_character_split_between_chunks() -> void:
	var buffer := NdjsonBuffer.new()
	var bytes := '{"name":"naïve café"}\n'.to_utf8_buffer()
	buffer.append(bytes.slice(0, 12))
	assert_eq(buffer.take_lines().size(), 0)
	buffer.append(bytes.slice(12))
	assert_eq(buffer.take_lines(), PackedStringArray(['{"name":"naïve café"}']))


func test_skips_empty_lines_and_carriage_returns() -> void:
	var buffer := NdjsonBuffer.new()
	buffer.append('\r\n{"id":4}\r\n\n'.to_utf8_buffer())
	assert_eq(buffer.take_lines(), PackedStringArray(['{"id":4}']))


func test_reports_a_line_longer_than_the_limit() -> void:
	var buffer := NdjsonBuffer.new(16)
	buffer.append("x".repeat(17).to_utf8_buffer())
	assert_true(buffer.is_overflowing())


func test_accepts_a_line_within_the_limit() -> void:
	var buffer := NdjsonBuffer.new(16)
	buffer.append("x".repeat(16).to_utf8_buffer())
	assert_false(buffer.is_overflowing())
