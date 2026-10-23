extends RefCounted

const GODOT_DEFAULT := {"style": "tabs", "size": 4}
const SCRIPT_EXTENSION := "gd"
const ADDONS_FOLDER := "res://addons"


static func of_project() -> Dictionary:
	return of_texts(_script_texts("res://"))


static func of_texts(texts: Array) -> Dictionary:
	var lines_with_tabs := 0
	var lines_with_spaces := 0
	var narrowest_space_indent := 0
	for text in texts:
		for line in (text as String).split("\n"):
			if line.begins_with("\t"):
				lines_with_tabs += 1
			elif line.begins_with(" ") and not line.strip_edges().is_empty():
				lines_with_spaces += 1
				var width := line.length() - line.lstrip(" ").length()
				if narrowest_space_indent == 0 or width < narrowest_space_indent:
					narrowest_space_indent = width
	if lines_with_spaces > lines_with_tabs:
		return {"style": "spaces", "size": narrowest_space_indent}
	return GODOT_DEFAULT.duplicate()


static func _script_texts(folder: String) -> Array:
	var texts: Array = []
	for file_name in DirAccess.get_files_at(folder):
		if file_name.get_extension() == SCRIPT_EXTENSION:
			texts.append(FileAccess.get_file_as_string(folder.path_join(file_name)))
	for subfolder in DirAccess.get_directories_at(folder):
		var path := folder.path_join(subfolder)
		if not subfolder.begins_with(".") and path != ADDONS_FOLDER:
			texts.append_array(_script_texts(path))
	return texts
