extends "res://addons/godot_mcp_tool/editor/voxel_gi_baker.gd"

var refusal_error: GodotMcpCommandError = null
var finds_geometry := true
var save_error := OK
var baked: Array = []
var saved_paths: Array = []
var saved_bytes := PackedByteArray([1, 2, 3, 4, 5, 6, 7, 8])


func refusal() -> GodotMcpCommandError:
	return refusal_error


func bake(voxel_gi: VoxelGI) -> VoxelGIData:
	baked.append(voxel_gi)
	if voxel_gi.data == null:
		voxel_gi.data = VoxelGIData.new()
	return voxel_gi.data


func holds_geometry(_data: VoxelGIData) -> bool:
	return finds_geometry


func warnings_of(_voxel_gi: VoxelGI) -> Array:
	return []


func save(data: VoxelGIData, path: String) -> Error:
	if save_error != OK:
		return save_error
	saved_paths.append(path)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(path.get_base_dir()))
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_buffer(saved_bytes)
	file.close()
	data.take_over_path(path)
	return OK
