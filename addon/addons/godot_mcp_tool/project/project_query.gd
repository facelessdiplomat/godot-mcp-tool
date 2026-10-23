extends SceneTree

const CommandRouter := preload("../commands/command_router.gd")
const GameRequestResponder := preload("../runtime/game_request_responder.gd")
const InputMapGetCommand := preload("../commands/input/input_map_get_command.gd")
const ProjectInfoCommand := preload("../commands/project/project_info_command.gd")
const ProjectSettingsGetCommand := preload("../commands/project/project_settings_get_command.gd")
const ScriptIndentation := preload("script_indentation.gd")
const VariantCodec := preload("../codec/variant_codec.gd")

const ANSWER_MARKER := "GODOT_MCP_TOOL_ANSWER "


func _initialize() -> void:
	var arguments := OS.get_cmdline_user_args()
	var method := arguments[0] if arguments.size() > 0 else ""
	var params: Variant = JSON.parse_string(arguments[1]) if arguments.size() > 1 else {}
	var router := CommandRouter.new()
	router.register("project.info", ProjectInfoCommand.new(ScriptIndentation.of_project))
	router.register("project.settings_get", ProjectSettingsGetCommand.new(VariantCodec.new()))
	router.register("input_map.get", InputMapGetCommand.new())
	var answer: Dictionary = await GameRequestResponder.new(router).respond({"id": 1, "method": method, "params": params if params is Dictionary else {}})
	print(ANSWER_MARKER + JSON.stringify(answer))
	quit()
