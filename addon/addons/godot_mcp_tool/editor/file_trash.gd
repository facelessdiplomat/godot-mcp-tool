extends RefCounted


func move_to_trash(absolute_path: String) -> Error:
	return OS.move_to_trash(absolute_path)
