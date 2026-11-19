extends RefCounted

const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")


func refusal() -> GodotMcpCommandError:
	return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Baking a VoxelGI needs the Godot editor")


func bake(_voxel_gi: VoxelGI) -> VoxelGIData:
	return null


func holds_geometry(_data: VoxelGIData) -> bool:
	return false


func warnings_of(_voxel_gi: VoxelGI) -> Array:
	return []


func save(_data: VoxelGIData, _path: String) -> Error:
	return ERR_UNAVAILABLE
