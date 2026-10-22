extends RefCounted

const TEXT_EXTENSIONS := ["tscn", "tres"]
const EXTERNAL_RESOURCE_PREFIX := "[ext_resource"


static func can_rewrite(file_path: String) -> bool:
	return file_path.get_extension().to_lower() in TEXT_EXTENSIONS


static func rewrite(file_path: String, renames: Dictionary) -> Error:
	var lines := FileAccess.get_file_as_string(file_path).split("\n")
	var changed := false
	for index in lines.size():
		if not lines[index].begins_with(EXTERNAL_RESOURCE_PREFIX):
			continue
		for old_path in renames:
			var old_attribute := "path=\"%s\"" % old_path
			if lines[index].contains(old_attribute):
				lines[index] = lines[index].replace(old_attribute, "path=\"%s\"" % renames[old_path])
				changed = true
	if not changed:
		return ERR_SKIP
	var file := FileAccess.open(file_path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string("\n".join(lines))
	file.close()
	return OK
