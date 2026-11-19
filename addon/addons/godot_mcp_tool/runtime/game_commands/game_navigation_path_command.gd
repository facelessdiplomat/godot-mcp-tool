extends "../../commands/command.gd"

const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpNavigationPathQuery := preload("../../navigation/navigation_path_query.gd")
const GodotMcpVariantCodec := preload("../../codec/variant_codec.gd")

const SYNCS_FOR_A_NEW_MAP := 1
const SYNCS_FOR_NEW_REGIONS := 2

var _scene: GodotMcpGameScene
var _codec: GodotMcpVariantCodec


func _init(scene: GodotMcpGameScene, codec: GodotMcpVariantCodec) -> void:
	_scene = scene
	_codec = codec


func execute(params: Dictionary) -> Variant:
	var request: Variant = GodotMcpNavigationPathQuery.read_request(params, _codec)
	if request is GodotMcpCommandError:
		return request
	var scene_root := _scene.root()
	if scene_root == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NO_SCENE, "The game has no current scene")
	var world := scene_root.get_viewport().find_world_3d()
	if world == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "The current scene of the game has no 3D world")
	var map := world.navigation_map
	if NavigationServer3D.map_get_iteration_id(map) == 0:
		await GodotMcpNavigationPathQuery.wait_for_syncs(scene_root.get_tree(), map, SYNCS_FOR_A_NEW_MAP)
	var report := GodotMcpNavigationPathQuery.query(map, request, _codec)
	if int(report["point_count"]) == 0:
		await GodotMcpNavigationPathQuery.wait_for_syncs(scene_root.get_tree(), map, SYNCS_FOR_NEW_REGIONS)
		report = GodotMcpNavigationPathQuery.query(map, request, _codec)
	report["scene"] = _scene.scene_path()
	report["unbaked_regions"] = []
	return report
