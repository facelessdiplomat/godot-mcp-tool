extends RefCounted


static func remove(directory_path: String) -> void:
	if not DirAccess.dir_exists_absolute(directory_path):
		return
	for subdirectory in DirAccess.get_directories_at(directory_path):
		remove(directory_path.path_join(subdirectory))
	for file_name in DirAccess.get_files_at(directory_path):
		DirAccess.remove_absolute(directory_path.path_join(file_name))
	DirAccess.remove_absolute(directory_path)
