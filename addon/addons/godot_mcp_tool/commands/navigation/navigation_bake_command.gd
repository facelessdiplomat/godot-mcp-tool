extends "../command.gd"

const GodotMcpChangeSet := preload("../../scene/change_set.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpIndefiniteArticle := preload("../../util/indefinite_article.gd")
const GodotMcpNavigationBakeReport := preload("../../navigation/navigation_bake_report.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")

const ACTION_NAME := "MCP: Bake navigation mesh"
const NAVIGATION_MESH_DATA: Array[StringName] = [&"vertices", &"polygons"]

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var region_path: Variant = GodotMcpParams.text(params, "path")
	for value in [scene_path, region_path]:
		if value is GodotMcpCommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	var regions: Variant = _regions_to_bake(scene_root, region_path)
	if regions is GodotMcpCommandError:
		return regions
	await Engine.get_main_loop().process_frame
	var changes := GodotMcpChangeSet.new()
	var baked: Array = []
	var skipped: Array = []
	var baked_meshes: Array[NavigationMesh] = []
	for region: NavigationRegion3D in regions:
		var path := GodotMcpNodeLocator.path_of(scene_root, region)
		var navigation_mesh := region.navigation_mesh
		if navigation_mesh == null:
			skipped.append({"path": path, "reason": "it has no NavigationMesh; give it one with node_set_properties, such as {\"navigation_mesh\": {\"new\": \"NavigationMesh\"}}"})
			continue
		if not navigation_mesh in baked_meshes:
			_bake(region, changes)
			baked_meshes.append(navigation_mesh)
		baked.append(GodotMcpNavigationBakeReport.describe(region, path, _context.codec))
	if not changes.is_empty():
		_context.history.record(ACTION_NAME, scene_root, [changes], false)
	return {"scene": scene_root.scene_file_path, "regions": baked, "skipped": skipped}


static func _bake(region: NavigationRegion3D, changes: GodotMcpChangeSet) -> void:
	var navigation_mesh := region.navigation_mesh
	for property in NAVIGATION_MESH_DATA:
		changes.add_undo_property(navigation_mesh, property, navigation_mesh.get(property))
	region.bake_navigation_mesh(false)
	for property in NAVIGATION_MESH_DATA:
		changes.add_do_property(navigation_mesh, property, navigation_mesh.get(property))


static func _regions_to_bake(scene_root: Node, region_path: String) -> Variant:
	if not region_path.is_empty():
		var node := GodotMcpNodeLocator.find(scene_root, region_path)
		if node == null:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % region_path, GodotMcpNodeLocator.not_found_hint(scene_root, region_path))
		if not node is NavigationRegion3D:
			return GodotMcpCommandError.new(
				GodotMcpJsonRpc.INVALID_PARAMS,
				"%s is %s, not a NavigationRegion3D" % [region_path, GodotMcpIndefiniteArticle.before(GodotMcpNodeFactory.display_class(node))],
				"Pass the path of a NavigationRegion3D, or leave path out to bake every one in the scene.",
			)
		return [node]
	var regions: Array = []
	_collect_regions(scene_root, scene_root, regions)
	if regions.is_empty():
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.NOT_FOUND,
			"%s has no NavigationRegion3D" % scene_root.scene_file_path,
			"Add one with node_add, give it {\"navigation_mesh\": {\"new\": \"NavigationMesh\"}} and put the floor and the obstacles under it.",
		)
	return regions


static func _collect_regions(node: Node, scene_root: Node, regions: Array) -> void:
	if node is NavigationRegion3D and (node == scene_root or node.owner == scene_root):
		regions.append(node)
	for child in node.get_children():
		_collect_regions(child, scene_root, regions)
