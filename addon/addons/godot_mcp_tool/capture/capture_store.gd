extends RefCounted

const DEFAULT_KEPT_CAPTURES := 100
const JPEG_QUALITY := 0.9
const EXTENSIONS := {"png": "png", "jpeg": "jpg"}

var directory: String

var _kept_captures: int
var _sequence := 0


func _init(capture_directory: String, kept_captures: int = DEFAULT_KEPT_CAPTURES) -> void:
	directory = capture_directory
	_kept_captures = kept_captures


func save(image: Image, prefix: String, format: String) -> Variant:
	if not EXTENSIONS.has(format):
		return ERR_INVALID_PARAMETER
	var directory_error := DirAccess.make_dir_recursive_absolute(directory)
	if directory_error != OK:
		return directory_error
	_sequence += 1
	var file_name := "%s-%d-%03d.%s" % [prefix, int(Time.get_unix_time_from_system() * 1000.0), _sequence % 1000, EXTENSIONS[format]]
	var path := directory.path_join(file_name)
	var save_error := image.save_png(path) if format == "png" else image.save_jpg(path, JPEG_QUALITY)
	if save_error != OK:
		return save_error
	_remove_old_captures()
	return path


func _remove_old_captures() -> void:
	var file_names := Array(DirAccess.get_files_at(directory))
	if file_names.size() <= _kept_captures:
		return
	file_names.sort_custom(func(left: String, right: String) -> bool: return _age_key(left) < _age_key(right))
	for file_name in file_names.slice(0, file_names.size() - _kept_captures):
		DirAccess.remove_absolute(directory.path_join(file_name))


static func _age_key(file_name: String) -> String:
	var parts := file_name.get_basename().split("-")
	return "%s-%s" % [parts[parts.size() - 2], parts[parts.size() - 1]] if parts.size() >= 3 else file_name
