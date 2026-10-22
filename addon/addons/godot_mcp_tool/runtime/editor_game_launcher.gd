extends "game_launcher.gd"

const SAVE_BEFORE_RUNNING_SETTING := "run/auto_save/save_before_running"


func is_playing() -> bool:
	return EditorInterface.is_playing_scene()


func play_main_scene() -> void:
	EditorInterface.play_main_scene()


func play_current_scene() -> void:
	EditorInterface.play_current_scene()


func play_scene(scene_path: String) -> void:
	EditorInterface.play_custom_scene(scene_path)


func stop() -> void:
	EditorInterface.stop_playing_scene()


func unsaved_scenes() -> PackedStringArray:
	if not EditorInterface.has_method(&"get_unsaved_scenes"):
		return PackedStringArray()
	return PackedStringArray(EditorInterface.call(&"get_unsaved_scenes"))


func saves_before_running() -> bool:
	return bool(EditorInterface.get_editor_settings().get_setting(SAVE_BEFORE_RUNNING_SETTING))
