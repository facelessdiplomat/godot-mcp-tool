extends RefCounted


func is_playing() -> bool:
	return false


func play_main_scene() -> void:
	pass


func play_current_scene() -> void:
	pass


func play_scene(_scene_path: String) -> void:
	pass


func stop() -> void:
	pass


func unsaved_scenes() -> PackedStringArray:
	return PackedStringArray()


func saves_before_running() -> bool:
	return false
