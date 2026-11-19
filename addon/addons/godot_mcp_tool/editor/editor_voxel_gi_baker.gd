extends "voxel_gi_baker.gd"

const HEADLESS_DISPLAY := "headless"
const FORWARD_PLUS := "forward_plus"
const RENDERING_METHOD_SETTING := "rendering/renderer/rendering_method"


func refusal() -> GodotMcpCommandError:
	if DisplayServer.get_name() == HEADLESS_DISPLAY:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.OPERATION_FAILED,
			"Baking a VoxelGI needs the editor with a window: without one the engine keeps no baked data",
			"Start the editor with a window: editor_launch without headless, or open the project in Godot.",
		)
	var rendering_method := RenderingServer.get_current_rendering_method()
	if rendering_method != FORWARD_PLUS:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.OPERATION_FAILED,
			"A VoxelGI works only with the Forward+ renderer, and this editor renders with %s" % rendering_method,
			"Set %s to forward_plus with project_settings_set and restart the editor, or light the scene without a VoxelGI." % RENDERING_METHOD_SETTING,
		)
	return null


func bake(voxel_gi: VoxelGI) -> VoxelGIData:
	voxel_gi.bake()
	return voxel_gi.data


func holds_geometry(data: VoxelGIData) -> bool:
	var level_counts := data.get_level_counts()
	return level_counts.size() > 1 and level_counts[level_counts.size() - 1] > 0


func warnings_of(voxel_gi: VoxelGI) -> Array:
	return Array(voxel_gi.get_configuration_warnings())


func save(data: VoxelGIData, path: String) -> Error:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(path.get_base_dir()))
	data.take_over_path(path)
	return ResourceSaver.save(data, path)
