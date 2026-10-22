extends RefCounted

const CommandRouter := preload("command_router.gd")
const EditingContext := preload("../scene/editing_context.gd")
const EditorRescanCommand := preload("editor/editor_rescan_command.gd")
const GameGetOutputCommand := preload("game/game_get_output_command.gd")
const GameRequestCommand := preload("game/game_request_command.gd")
const GameRunCommand := preload("game/game_run_command.gd")
const GameStopCommand := preload("game/game_stop_command.gd")
const NodeAddCommand := preload("node/node_add_command.gd")
const NodeDeleteCommand := preload("node/node_delete_command.gd")
const NodeGetPropertiesCommand := preload("node/node_get_properties_command.gd")
const NodeSetPropertiesCommand := preload("node/node_set_properties_command.gd")
const PingCommand := preload("ping_command.gd")
const ProjectInfoCommand := preload("project/project_info_command.gd")
const ProjectSettingsGetCommand := preload("project/project_settings_get_command.gd")
const ProjectSettingsSetCommand := preload("project/project_settings_set_command.gd")
const RuntimeContext := preload("../runtime/runtime_context.gd")
const SceneCreateCommand := preload("scene/scene_create_command.gd")
const SceneGetTreeCommand := preload("scene/scene_get_tree_command.gd")
const SceneOpenCommand := preload("scene/scene_open_command.gd")
const SceneSaveCommand := preload("scene/scene_save_command.gd")


const INSPECTION_TIMEOUT_MSEC := 10_000
const WAIT_TIMEOUT_MSEC := 65_000


static func build_router(context: EditingContext, runtime: RuntimeContext, read_indentation: Callable, save_project_settings: Callable) -> CommandRouter:
	var router := CommandRouter.new()
	router.register("ping", PingCommand.new())
	router.register("project.info", ProjectInfoCommand.new(read_indentation))
	router.register("project.settings_get", ProjectSettingsGetCommand.new(context.codec))
	router.register("project.settings_set", ProjectSettingsSetCommand.new(context.codec, save_project_settings))
	router.register("editor.rescan", EditorRescanCommand.new())
	router.register("scene.create", SceneCreateCommand.new(context))
	router.register("scene.open", SceneOpenCommand.new(context))
	router.register("scene.save", SceneSaveCommand.new(context))
	router.register("scene.get_tree", SceneGetTreeCommand.new(context))
	router.register("node.add", NodeAddCommand.new(context))
	router.register("node.delete", NodeDeleteCommand.new(context))
	router.register("node.get_properties", NodeGetPropertiesCommand.new(context))
	router.register("node.set_properties", NodeSetPropertiesCommand.new(context))
	router.register("game.run", GameRunCommand.new(context, runtime))
	router.register("game.stop", GameStopCommand.new(runtime))
	router.register("game.get_output", GameGetOutputCommand.new(runtime))
	router.register("game.get_tree", GameRequestCommand.new(runtime, "tree", INSPECTION_TIMEOUT_MSEC))
	router.register("game.get_properties", GameRequestCommand.new(runtime, "properties.get", INSPECTION_TIMEOUT_MSEC))
	router.register("game.set_properties", GameRequestCommand.new(runtime, "properties.set", INSPECTION_TIMEOUT_MSEC))
	router.register("game.wait", GameRequestCommand.new(runtime, "wait", WAIT_TIMEOUT_MSEC))
	return router
