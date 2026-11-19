extends SceneTree

const GodotMcpAudioBusesGetCommand := preload("../commands/audio/audio_buses_get_command.gd")
const GodotMcpAudioBusLayoutFile := preload("../audio/audio_bus_layout_file.gd")
const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpCommandRouter := preload("../commands/command_router.gd")
const GodotMcpEditingContext := preload("../scene/editing_context.gd")
const GodotMcpFileSystemAccess := preload("../editor/file_system_access.gd")
const GodotMcpGameRequestResponder := preload("../runtime/game_request_responder.gd")
const GodotMcpGridMapGetCellsCommand := preload("../commands/grid/gridmap_get_cells_command.gd")
const GodotMcpInputMapGetCommand := preload("../commands/input/input_map_get_command.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")
const GodotMcpNavigationGetPathCommand := preload("../commands/navigation/navigation_get_path_command.gd")
const GodotMcpNodeFindCommand := preload("../commands/node/node_find_command.gd")
const GodotMcpNodeGetBoundsCommand := preload("../commands/node/node_get_bounds_command.gd")
const GodotMcpNodeGetPropertiesCommand := preload("../commands/node/node_get_properties_command.gd")
const GodotMcpPlainUndoHistory := preload("../scene/plain_undo_history.gd")
const GodotMcpProjectInfoCommand := preload("../commands/project/project_info_command.gd")
const GodotMcpProjectSettingsGetCommand := preload("../commands/project/project_settings_get_command.gd")
const GodotMcpSceneAccess := preload("../scene/scene_access.gd")
const GodotMcpSceneGetTreeCommand := preload("../commands/scene/scene_get_tree_command.gd")
const GodotMcpScriptEditorAccess := preload("../editor/script_editor_access.gd")
const GodotMcpScriptIndentation := preload("script_indentation.gd")
const GodotMcpShaderValidateCommand := preload("../commands/shader/shader_validate_command.gd")
const GodotMcpSignalListCommand := preload("../commands/signal/signal_list_command.gd")
const GodotMcpTileMapGetCellsCommand := preload("../commands/grid/tilemap_get_cells_command.gd")
const GodotMcpUserDataGetCommand := preload("../commands/project/user_data_get_command.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const ANSWER_MARKER := "GODOT_MCP_TOOL_ANSWER "
const SCENE_READING_METHODS := ["scene.get_tree", "node.find", "node.get_properties", "node.get_bounds", "navigation.get_path", "gridmap.get_cells", "tilemap.get_cells", "signal.list"]


class GodotMcpRunningGameOutOfReach:
	extends "../commands/game/game_request_command.gd"

	var _message: String
	var _hint: String

	func _init(message: String, hint: String) -> void:
		super(null, "", 0)
		_message = message
		_hint = hint

	func execute(_params: Dictionary) -> Variant:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.GAME_NOT_RUNNING, _message, _hint)


func _initialize() -> void:
	var arguments := OS.get_cmdline_user_args()
	var method := arguments[0] if arguments.size() > 0 else ""
	var parsed_params: Variant = JSON.parse_string(arguments[1]) if arguments.size() > 1 else {}
	var params: Dictionary = parsed_params if parsed_params is Dictionary else {}
	var answer: Dictionary = {}
	if method in SCENE_READING_METHODS and params.get("in_game") != true and str(params.get("scene", "")).is_empty():
		answer = {"id": 1, "error": {"code": GodotMcpJsonRpc.NO_SCENE, "message": "Without the editor no scene is open", "hint": "Pass \"scene\", such as \"main\" or \"res://levels/arena.tscn\"."}}
	else:
		answer = await GodotMcpGameRequestResponder.new(_router()).respond({"id": 1, "method": method, "params": params})
	print(ANSWER_MARKER + JSON.stringify(answer))
	quit()


static func _router() -> GodotMcpCommandRouter:
	var codec := GodotMcpVariantCodec.new()
	var context := GodotMcpEditingContext.new(GodotMcpSceneAccess.new(), GodotMcpPlainUndoHistory.new(), codec, GodotMcpScriptEditorAccess.new())
	var router := GodotMcpCommandRouter.new()
	router.register("project.info", GodotMcpProjectInfoCommand.new(GodotMcpScriptIndentation.of_project))
	router.register("project.settings_get", GodotMcpProjectSettingsGetCommand.new(codec))
	router.register("project.user_data_get", GodotMcpUserDataGetCommand.new())
	router.register("input_map.get", GodotMcpInputMapGetCommand.new())
	router.register("audio.buses_get", GodotMcpAudioBusesGetCommand.new(GodotMcpAudioBusLayoutFile.new(GodotMcpFileSystemAccess.new())))
	router.register("shader.validate", GodotMcpShaderValidateCommand.new())
	router.register("scene.get_tree", GodotMcpSceneGetTreeCommand.new(context))
	router.register("node.find", GodotMcpNodeFindCommand.new(context))
	router.register("node.get_properties", GodotMcpNodeGetPropertiesCommand.new(context))
	router.register("node.get_bounds", GodotMcpNodeGetBoundsCommand.new(context, GodotMcpRunningGameOutOfReach.new("Without the editor, node_get_bounds measures scenes, not the running game", "Read the running game with game_get_properties, such as global_position.")))
	router.register("navigation.get_path", GodotMcpNavigationGetPathCommand.new(context, GodotMcpRunningGameOutOfReach.new("Without the editor, navigation_get_path reads scenes, not the running game", "Pass scene instead of in_game, or start the editor with editor_launch.")))
	router.register("gridmap.get_cells", GodotMcpGridMapGetCellsCommand.new(context))
	router.register("tilemap.get_cells", GodotMcpTileMapGetCellsCommand.new(context))
	router.register("signal.list", GodotMcpSignalListCommand.new(context))
	return router
