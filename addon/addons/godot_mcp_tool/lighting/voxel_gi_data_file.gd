extends RefCounted

const DATA_SUFFIX := "_data.res"
const SUBRESOURCE_MARK := "::"


static func path_for(scene_path: String, voxel_gi: VoxelGI, taken: Dictionary) -> String:
	var current := voxel_gi.data
	if current != null and is_file(current.resource_path) and not taken.has(current.resource_path):
		return current.resource_path
	var stem := "%s.%s" % [scene_path.get_basename(), voxel_gi.name]
	var path := stem + DATA_SUFFIX
	var copy := 2
	while taken.has(path):
		path = "%s%d%s" % [stem, copy, DATA_SUFFIX]
		copy += 1
	return path


static func is_file(resource_path: String) -> bool:
	return not resource_path.is_empty() and not SUBRESOURCE_MARK in resource_path
