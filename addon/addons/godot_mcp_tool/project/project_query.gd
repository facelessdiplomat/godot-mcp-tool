extends SceneTree

const CommandError := preload("../commands/command_error.gd")
const CommandRouter := preload("../commands/command_router.gd")
const EditingContext := preload("../scene/editing_context.gd")
const GameRequestResponder := preload("../runtime/game_request_responder.gd")
const InputMapGetCommand := preload("../commands/input/input_map_get_command.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")
const NodeFindCommand := preload("../commands/node/node_find_command.gd")
const NodeGetBoundsCommand := preload("../commands/node/node_get_bounds_command.gd")
const NodeGetPropertiesCommand := preload("../commands/node/node_get_properties_command.gd")
const PlainUndoHistory := preload("../scene/plain_undo_history.gd")
const ProjectInfoCommand := preload("../commands/project/project_info_command.gd")
const ProjectSettingsGetCommand := preload("../commands/project/project_settings_get_command.gd")
const SceneAccess := preload("../scene/scene_access.gd")
const SceneGetTreeCommand := preload("../commands/scene/scene_get_tree_command.gd")
const ScriptEditorAccess := preload("../editor/script_editor_access.gd")
const ScriptIndentation := preload("script_indentation.gd")
const SignalListCommand := preload("../commands/signal/signal_list_command.gd")
const VariantCodec := preload("../codec/variant_codec.gd")

const ANSWER_MARKER := "GODOT_MCP_TOOL_ANSWER "
const SCENE_READING_METHODS := ["scene.get_tree", "node.find", "node.get_properties", "node.get_bounds", "signal.list"]


class RunningGameOutOfReach:
	extends "../commands/game/game_request_command.gd"

	func _init() -> void:
		super(null, "bounds", 0)

	func execute(_params: Dictionary) -> Variant:
		return CommandError.new(
			JsonRpc.GAME_NOT_RUNNING,
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
		answer = {"id": 1, "error": {"code": JsonRpc.NO_SCENE, "message": "Without the editor no scene is open", "hint": "Pass \"scene\", such as \"main\" or \"res://levels/arena.tscn\"."}}
	else:
		answer = await GameRequestResponder.new(_router()).respond({"id": 1, "method": method, "params": params})
	print(ANSWER_MARKER + JSON.stringify(answer))
	quit()


static func _router() -> CommandRouter:
	var codec := VariantCodec.new()
	var context := EditingContext.new(SceneAccess.new(), PlainUndoHistory.new(), codec, ScriptEditorAccess.new())
	var router := CommandRouter.new()
	router.register("project.info", ProjectInfoCommand.new(ScriptIndentation.of_project))
	router.register("project.settings_get", ProjectSettingsGetCommand.new(codec))
	router.register("input_map.get", InputMapGetCommand.new())
	router.register("scene.get_tree", SceneGetTreeCommand.new(context))
	router.register("node.find", NodeFindCommand.new(context))
	router.register("node.get_properties", NodeGetPropertiesCommand.new(context))
	router.register("node.get_bounds", NodeGetBoundsCommand.new(context, RunningGameOutOfReach.new()))
	router.register("signal.list", SignalListCommand.new(context))
	return router
