extends "script_editor_access.gd"

const EXTERNAL_CHANGE_DIALOG_TITLE := "Files have been modified outside Godot"


func unsaved_files() -> PackedStringArray:
	return EditorInterface.get_script_editor().get_unsaved_files()


func open_script_paths() -> PackedStringArray:
	var paths := PackedStringArray()
	for script in EditorInterface.get_script_editor().get_open_scripts():
		paths.append(script.resource_path)
	return paths


func reload_open_files() -> void:
	EditorInterface.get_script_editor().reload_open_files()
	var tree := Engine.get_main_loop() as SceneTree
	await tree.process_frame
	await tree.process_frame


func files_changed_outside() -> PackedStringArray:
	var file_names := PackedStringArray()
	var dialog := _external_change_dialog()
	if dialog == null or not dialog.visible:
		return file_names
	for tree in dialog.find_children("*", "Tree", true, false):
		var root := (tree as Tree).get_root()
		if root == null:
			continue
		for item in root.get_children():
			file_names.append(item.get_text(0))
	return file_names


static func _external_change_dialog() -> ConfirmationDialog:
	for dialog in EditorInterface.get_script_editor().find_children("*", "ConfirmationDialog", true, false):
		if (dialog as ConfirmationDialog).title == EXTERNAL_CHANGE_DIALOG_TITLE:
			return dialog
	return null
