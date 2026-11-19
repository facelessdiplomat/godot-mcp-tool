extends "../command.gd"

const GodotMcpCommand := preload("../command.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNavigationPathQuery := preload("../../navigation/navigation_path_query.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSceneSnapshot := preload("../../scene/scene_snapshot.gd")

const SYNCS_BEFORE_ASKING := 2

var _context: GodotMcpEditingContext
var _in_game: GodotMcpCommand


func _init(context: GodotMcpEditingContext, in_game: GodotMcpCommand) -> void:
	_context = context
	_in_game = in_game


func execute(params: Dictionary) -> Variant:
	var in_game: Variant = GodotMcpParams.flag(params, "in_game", false)
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var request: Variant = GodotMcpNavigationPathQuery.read_request(params, _context.codec)
	for value in [in_game, scene_path, request]:
		if value is GodotMcpCommandError:
			return value
	if in_game:
		if not (scene_path as String).is_empty():
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"scene\" and \"in_game\" cannot be used together", "With in_game the path is found in the current scene of the running game.")
		return await _in_game.execute(params)
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var snapshot := resolved as GodotMcpSceneSnapshot
	var result: Variant = await _find_path(snapshot, request)
	snapshot.release()
	return result


func _find_path(snapshot: GodotMcpSceneSnapshot, request: Dictionary) -> Variant:
	var regions := _regions_of(snapshot.root)
	if regions.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s has no NavigationRegion3D" % snapshot.scene_path, "Add a NavigationRegion3D with a NavigationMesh whose children are the floor and the obstacles, and bake it with navigation_bake.")
	var unbaked := regions.filter(func(region: NavigationRegion3D) -> bool: return region.navigation_mesh == null or region.navigation_mesh.get_polygon_count() == 0)
	if unbaked.size() == regions.size():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "No NavigationRegion3D of %s has a baked navigation mesh" % snapshot.scene_path, "Bake them with navigation_bake, then ask again.")
	var tree := Engine.get_main_loop() as SceneTree
	var viewport := SubViewport.new()
	viewport.world_3d = World3D.new()
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	viewport.add_child(snapshot.root.duplicate(Node.DUPLICATE_GROUPS))
	tree.root.add_child(viewport)
	var map := viewport.world_3d.navigation_map
	await GodotMcpNavigationPathQuery.wait_for_syncs(tree, map, SYNCS_BEFORE_ASKING)
	var report := GodotMcpNavigationPathQuery.query(map, request, _context.codec)
	if int(report["point_count"]) == 0:
		await GodotMcpNavigationPathQuery.wait_for_syncs(tree, map, SYNCS_BEFORE_ASKING)
		report = GodotMcpNavigationPathQuery.query(map, request, _context.codec)
	viewport.free()
	report["scene"] = snapshot.scene_path
	report["unbaked_regions"] = unbaked.map(func(region: NavigationRegion3D) -> String: return GodotMcpNodeLocator.path_of(snapshot.root, region))
	return report


static func _regions_of(scene_root: Node) -> Array:
	var regions: Array = scene_root.find_children("*", "NavigationRegion3D", true, false)
	if scene_root is NavigationRegion3D:
		regions.push_front(scene_root)
	return regions
