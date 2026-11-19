extends "../command.gd"

const GodotMcpChangeSet := preload("../../scene/change_set.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpIndefiniteArticle := preload("../../util/indefinite_article.gd")
const GodotMcpInstancedScenes := preload("../../scene/instanced_scenes.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpVoxelGiBaker := preload("../../editor/voxel_gi_baker.gd")
const GodotMcpVoxelGiDataFile := preload("../../lighting/voxel_gi_data_file.gd")

const ACTION_NAME := "MCP: Bake VoxelGI"
const SUBDIVISIONS := [64, 128, 256, 512]
const BUTTONS_OF_THE_EDITOR := {
	"LightmapGI": "Bake Lightmaps",
	"OccluderInstance3D": "Bake Occluders",
}

var _context: GodotMcpEditingContext
var _baker: GodotMcpVoxelGiBaker


func _init(context: GodotMcpEditingContext, baker: GodotMcpVoxelGiBaker) -> void:
	_context = context
	_baker = baker


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var node_path: Variant = GodotMcpParams.text(params, "path")
	for value in [scene_path, node_path]:
		if value is GodotMcpCommandError:
			return value
	var refusal := _baker.refusal()
	if refusal != null:
		return refusal
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	if scene_root.scene_file_path.is_empty():
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.INVALID_PARAMS,
			"The scene has never been saved, so its baked data has no place next to it",
			"Save it first with scene_save and a path, such as \"res://cave.tscn\".",
		)
	var targets: Variant = _targets(scene_root, node_path)
	if targets is GodotMcpCommandError:
		return targets
	await Engine.get_main_loop().process_frame
	var changes := GodotMcpChangeSet.new()
	var baked: Array = []
	var taken := {}
	for voxel_gi: VoxelGI in targets:
		var path := GodotMcpNodeLocator.path_of(scene_root, voxel_gi)
		var earlier := voxel_gi.data
		var data_path := GodotMcpVoxelGiDataFile.path_for(scene_root.scene_file_path, voxel_gi, taken)
		taken[data_path] = true
		if earlier != null and earlier.resource_path != data_path and GodotMcpVoxelGiDataFile.is_file(earlier.resource_path):
			voxel_gi.data = null
		var data := _baker.bake(voxel_gi)
		var save_error := _baker.save(data, data_path) if data != null else ERR_UNAVAILABLE
		if save_error != OK:
			voxel_gi.data = earlier
			changes.revert()
			return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not save the baked data of %s to %s: %s" % [path, data_path, error_string(save_error)])
		changes.add_undo_property(voxel_gi, "data", earlier)
		changes.add_do_property(voxel_gi, "data", data)
		baked.append({
			"path": path,
			"data": data_path,
			"bytes": _file_length(data_path),
			"subdiv": SUBDIVISIONS[voxel_gi.subdiv],
			"size": [voxel_gi.size.x, voxel_gi.size.y, voxel_gi.size.z],
			"geometry": _baker.holds_geometry(data),
			"warnings": _baker.warnings_of(voxel_gi),
		})
	_context.history.record(ACTION_NAME, scene_root, [changes], false)
	return {"scene": scene_root.scene_file_path, "baked": baked}


static func _targets(scene_root: Node, node_path: String) -> Variant:
	if not node_path.is_empty():
		var node := GodotMcpNodeLocator.find(scene_root, node_path)
		if node == null:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(scene_root, node_path))
		var button := _button_that_bakes(node)
		if not button.is_empty():
			return GodotMcpCommandError.new(
				GodotMcpJsonRpc.INVALID_PARAMS,
				"%s is %s, which no tool can bake: the engine gives scripts no bake method for it" % [node_path, _described(node)],
				_baking_in_the_editor(button),
			)
		if not node is VoxelGI:
			return GodotMcpCommandError.new(
				GodotMcpJsonRpc.INVALID_PARAMS,
				"%s is %s, not a VoxelGI" % [node_path, _described(node)],
				"Pass the path of a VoxelGI, or leave path out to bake every one in the scene.",
			)
		var refusal := GodotMcpInstancedScenes.refusal_for_part_of(node, scene_root, "baked data")
		return [node] if refusal == null else refusal
	var voxel_gis: Array = []
	var baked_in_the_editor: Array = []
	_collect(scene_root, scene_root, voxel_gis, baked_in_the_editor)
	if not voxel_gis.is_empty():
		return voxel_gis
	var hint := "Add one with node_add, with a size that covers the place to light, such as {\"type\": \"VoxelGI\", \"properties\": {\"size\": [20, 8, 20]}}; meshes and CSG shapes take part with their default GI mode Static."
	if not baked_in_the_editor.is_empty():
		var node: Node = baked_in_the_editor[0]
		hint = "%s is %s, which no tool can bake: %s" % [GodotMcpNodeLocator.path_of(scene_root, node), _described(node), _baking_in_the_editor(_button_that_bakes(node))]
	return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s has no VoxelGI" % scene_root.scene_file_path, hint)


static func _collect(node: Node, scene_root: Node, voxel_gis: Array, baked_in_the_editor: Array) -> void:
	if node == scene_root or node.owner == scene_root:
		if node is VoxelGI:
			voxel_gis.append(node)
		elif not _button_that_bakes(node).is_empty():
			baked_in_the_editor.append(node)
	for child in node.get_children():
		_collect(child, scene_root, voxel_gis, baked_in_the_editor)


static func _button_that_bakes(node: Node) -> String:
	for node_class: String in BUTTONS_OF_THE_EDITOR:
		if node.is_class(node_class):
			return BUTTONS_OF_THE_EDITOR[node_class]
	return ""


static func _baking_in_the_editor(button: String) -> String:
	return "Ask the user to select it in the editor and press %s in the toolbar of the 3D view, then save the scene." % button


static func _described(node: Node) -> String:
	return GodotMcpIndefiniteArticle.before(GodotMcpNodeFactory.display_class(node))


static func _file_length(path: String) -> int:
	var file := FileAccess.open(path, FileAccess.READ)
	return file.get_length() if file != null else 0
