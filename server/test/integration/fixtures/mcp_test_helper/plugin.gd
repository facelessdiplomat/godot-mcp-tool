@tool
extends EditorPlugin

const REQUEST_FILE := "res://.mcp_test_request.json"
const RESPONSE_FILE := "res://.mcp_test_response.json"
const EXTERNAL_CHANGE_DIALOG_TITLE := "Files have been modified outside Godot"

var _busy := false


func _process(_delta: float) -> void:
	if _busy or not FileAccess.file_exists(REQUEST_FILE):
		return
	_busy = true
	var request: Variant = JSON.parse_string(FileAccess.get_file_as_string(REQUEST_FILE))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(REQUEST_FILE))
	var response: Dictionary = await _handle(request if request is Dictionary else {})
	var file := FileAccess.open(RESPONSE_FILE, FileAccess.WRITE)
	file.store_string(JSON.stringify(response))
	file.close()
	_busy = false


func _handle(request: Dictionary) -> Dictionary:
	match request.get("action", ""):
		"type_in_script":
			return await _type_in_script(str(request.get("path", "")), str(request.get("text", "")))
		"reload_from_disk":
			return _reload_from_disk()
		"undo_in_edited_scene":
			return _undo_in_edited_scene()
	return {"error": "unknown action %s" % request.get("action", "")}


func _type_in_script(script_path: String, text: String) -> Dictionary:
	var script := load(script_path) as Script
	if script == null:
		return {"error": "cannot load %s" % script_path}
	EditorInterface.edit_script(script)
	await get_tree().process_frame
	var code_edit := EditorInterface.get_script_editor().get_current_editor().get_base_editor() as CodeEdit
	var last_line := code_edit.get_line_count() - 1
	code_edit.set_caret_line(last_line)
	code_edit.set_caret_column(code_edit.get_line(last_line).length())
	code_edit.insert_text_at_caret(text)
	return {"unsaved": Array(EditorInterface.get_script_editor().get_unsaved_files())}


func _reload_from_disk() -> Dictionary:
	for dialog in EditorInterface.get_script_editor().find_children("*", "ConfirmationDialog", true, false):
		var confirmation := dialog as ConfirmationDialog
		if confirmation.title == EXTERNAL_CHANGE_DIALOG_TITLE and confirmation.visible:
			confirmation.get_ok_button().pressed.emit()
			return {"reloaded": true, "unsaved": Array(EditorInterface.get_script_editor().get_unsaved_files())}
	return {"reloaded": false}


func _undo_in_edited_scene() -> Dictionary:
	var scene_root := EditorInterface.get_edited_scene_root()
	if scene_root == null:
		return {"error": "no edited scene"}
	var undo_redo := EditorInterface.get_editor_undo_redo()
	var history := undo_redo.get_history_undo_redo(undo_redo.get_object_history_id(scene_root))
	var action_name := history.get_current_action_name()
	return {"undone": history.undo(), "action": action_name}

