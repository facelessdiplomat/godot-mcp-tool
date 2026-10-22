extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")
const ScriptEditorAccess := preload("script_editor_access.gd")

const BUILT_IN_RESOURCE_SEPARATOR := "::"

var _scripts: ScriptEditorAccess


func _init(scripts: ScriptEditorAccess) -> void:
	_scripts = scripts


func prepare_for_saving() -> Variant:
	await _scripts.reload_open_files()
	var conflicting := _full_paths(_scripts.files_changed_outside())
	if not conflicting.is_empty():
		return CommandError.new(
			JsonRpc.CONFLICT,
			"Changed on disk while the editor has unsaved changes to them: %s. Saving now would overwrite the files on disk with the editor's version" % ", ".join(conflicting),
			"Nothing was saved. The editor shows the dialog \"Files have been modified outside Godot\": ask the user to choose \"Reload from disk\" to keep the files on disk, or \"Ignore external changes\" to keep the editor's version, then try again.",
		)
	var written: Array = []
	for file_path in _scripts.unsaved_files():
		if not file_path.contains(BUILT_IN_RESOURCE_SEPARATOR):
			written.append(file_path)
	return written


func _full_paths(file_names: PackedStringArray) -> PackedStringArray:
	var known_paths := _scripts.unsaved_files() + _scripts.open_script_paths()
	var paths := PackedStringArray()
	for file_name in file_names:
		var matching := Array(known_paths).filter(func(known_path: String) -> bool: return known_path.get_file() == file_name)
		for matched_path in matching if not matching.is_empty() else [file_name]:
			if not matched_path in paths:
				paths.append(matched_path)
	return paths
