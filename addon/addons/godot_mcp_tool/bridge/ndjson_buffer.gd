extends RefCounted

const NEWLINE_BYTE := 10
const DEFAULT_MAXIMUM_LINE_BYTES := 64 * 1024 * 1024

var _maximum_line_bytes: int
var _pending_bytes := PackedByteArray()


func _init(maximum_line_bytes: int = DEFAULT_MAXIMUM_LINE_BYTES) -> void:
	_maximum_line_bytes = maximum_line_bytes


func append(bytes: PackedByteArray) -> void:
	_pending_bytes.append_array(bytes)


func take_lines() -> PackedStringArray:
	var lines := PackedStringArray()
	var newline_index := _pending_bytes.find(NEWLINE_BYTE)
	while newline_index != -1:
		var line := _pending_bytes.slice(0, newline_index).get_string_from_utf8().strip_edges()
		_pending_bytes = _pending_bytes.slice(newline_index + 1)
		if not line.is_empty():
			lines.append(line)
		newline_index = _pending_bytes.find(NEWLINE_BYTE)
	return lines


func is_overflowing() -> bool:
	return _pending_bytes.size() > _maximum_line_bytes
