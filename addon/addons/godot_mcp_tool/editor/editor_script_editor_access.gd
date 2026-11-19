extends "script_editor_access.gd"

const GodotMcpChangedScriptReloader := preload("changed_script_reloader.gd")

const EXTERNAL_CHANGE_DIALOG_TITLE := "Files have been modified outside Godot"
const MAXIMUM_SELECTION_LENGTH := 2000


func unsaved_files() -> PackedStringArray:
	return EditorInterface.get_script_editor().get_unsaved_files()


func breakpoints() -> PackedStringArray:
	return EditorInterface.get_script_editor().get_breakpoints()


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


func reload_changed_closed_scripts() -> PackedStringArray:
	return GodotMcpChangedScriptReloader.reload_changed(GodotMcpChangedScriptReloader.project_scripts("res://"), open_script_paths())


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


func current_script_place() -> Dictionary:
	var script_editor := EditorInterface.get_script_editor()
	var script := script_editor.get_current_script()
	if script == null:
		return {}
	var place := {"path": script.resource_path}
	var current_editor := script_editor.get_current_editor()
	var code := current_editor.get_base_editor() as CodeEdit if current_editor != null else null
	if code != null:
		place["line"] = code.get_caret_line() + 1
		var selection := code.get_selected_text()
		if not selection.is_empty():
			place["selection"] = selection.left(MAXIMUM_SELECTION_LENGTH)
	return place
