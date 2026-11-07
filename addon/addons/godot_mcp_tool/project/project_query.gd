extends SceneTree

const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpCommandRouter := preload("../commands/command_router.gd")
const GodotMcpEditingContext := preload("../scene/editing_context.gd")
const GodotMcpGameRequestResponder := preload("../runtime/game_request_responder.gd")
const GodotMcpInputMapGetCommand := preload("../commands/input/input_map_get_command.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")
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
const GodotMcpSignalListCommand := preload("../commands/signal/signal_list_command.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const ANSWER_MARKER := "GODOT_MCP_TOOL_ANSWER "
const SCENE_READING_METHODS := ["scene.get_tree", "node.find", "node.get_properties", "node.get_bounds", "signal.list"]


class GodotMcpRunningGameOutOfReach:
	extends "../commands/game/game_request_command.gd"

	func _init() -> void:
		super(null, "bounds", 0)

	func execute(_params: Dictionary) -> Variant:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.GAME_NOT_RUNNING,
			"Without the editor, node_get_bounds measures scenes, not the running game",
			"Read the running game with game_get_properties, such as global_position.",
		)


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
	router.register("input_map.get", GodotMcpInputMapGetCommand.new())
	router.register("scene.get_tree", GodotMcpSceneGetTreeCommand.new(context))
	router.register("node.find", GodotMcpNodeFindCommand.new(context))
	router.register("node.get_properties", GodotMcpNodeGetPropertiesCommand.new(context))
	router.register("node.get_bounds", GodotMcpNodeGetBoundsCommand.new(context, GodotMcpRunningGameOutOfReach.new()))
	router.register("signal.list", GodotMcpSignalListCommand.new(context))
	return router
