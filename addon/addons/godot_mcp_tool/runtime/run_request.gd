extends RefCounted

const DEBUG_DRAWINGS := ["collisions", "navigation", "paths", "avoidance"]

var fixed_fps := 0
var debug_draw := PackedStringArray()
var arguments := PackedStringArray()
var window_size := Vector2i.ZERO
var locale := ""
var break_on_error := false


func _init(fixed_frames_per_second: int = 0) -> void:
	fixed_fps = fixed_frames_per_second
