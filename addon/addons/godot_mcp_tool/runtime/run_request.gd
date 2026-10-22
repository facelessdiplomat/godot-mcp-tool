extends RefCounted

var fixed_fps := 0


func _init(fixed_frames_per_second: int = 0) -> void:
	fixed_fps = fixed_frames_per_second
