extends RefCounted

const GodotMcpAddonInfo := preload("../addon_info.gd")
const GodotMcpAnimationDeleteCommand := preload("animation/animation_delete_command.gd")
const GodotMcpAnimationGetCommand := preload("animation/animation_get_command.gd")
const GodotMcpAnimationSetCommand := preload("animation/animation_set_command.gd")
const GodotMcpAnimationTreeGetCommand := preload("animation/animation_tree_get_command.gd")
const GodotMcpAnimationTreeSetCommand := preload("animation/animation_tree_set_command.gd")
const GodotMcpAssetImportSettingsGetCommand := preload("asset/asset_import_settings_get_command.gd")
const GodotMcpAudioBusesGetCommand := preload("audio/audio_buses_get_command.gd")
const GodotMcpAudioBusesSetCommand := preload("audio/audio_buses_set_command.gd")
const GodotMcpAudioBusLayoutFile := preload("../audio/audio_bus_layout_file.gd")
const GodotMcpAssetImportSettingsSetCommand := preload("asset/asset_import_settings_set_command.gd")
const GodotMcpAutoloadAddCommand := preload("project/autoload_add_command.gd")
const GodotMcpAutoloadRegistry := preload("../editor/autoload_registry.gd")
const GodotMcpAutoloadRemoveCommand := preload("project/autoload_remove_command.gd")
const GodotMcpCommandRouter := preload("command_router.gd")
const GodotMcpEditingContext := preload("../scene/editing_context.gd")
const GodotMcpEditorFileSystemAccess := preload("../editor/editor_file_system_access.gd")
const GodotMcpEditorMeshPreviewAccess := preload("../editor/editor_mesh_preview_access.gd")
const GodotMcpEditorBreakpointsCommand := preload("editor/editor_breakpoints_command.gd")
const GodotMcpEditorExtensionAccess := preload("../editor/editor_extension_access.gd")
const GodotMcpEditorGetStateCommand := preload("editor/editor_get_state_command.gd")
const GodotMcpEditorReloadExtensionsCommand := preload("editor/editor_reload_extensions_command.gd")
const GodotMcpEditorRescanCommand := preload("editor/editor_rescan_command.gd")
const GodotMcpEditorRunScriptCommand := preload("editor/editor_run_script_command.gd")
const GodotMcpEditorScreenshotCommand := preload("editor/editor_screenshot_command.gd")
const GodotMcpEditorScriptEditorAccess := preload("../editor/editor_script_editor_access.gd")
const GodotMcpEditorSelectCommand := preload("editor/editor_select_command.gd")
const GodotMcpEditorPluginAccess := preload("../editor/editor_plugin_access.gd")
const GodotMcpEditorRedoCommand := preload("editor/editor_redo_command.gd")
const GodotMcpEditorSetPluginEnabledCommand := preload("editor/editor_set_plugin_enabled_command.gd")
const GodotMcpEditorUndoCommand := preload("editor/editor_undo_command.gd")
const GodotMcpEditorUnsavedFilesCommand := preload("editor/editor_unsaved_files_command.gd")
const GodotMcpEditorViewportAccess := preload("../editor/editor_viewport_access.gd")
const GodotMcpFileTrash := preload("../editor/file_trash.gd")
const GodotMcpFilesystemDeleteCommand := preload("file/filesystem_delete_command.gd")
const GodotMcpFilesystemMoveCommand := preload("file/filesystem_move_command.gd")
const GodotMcpGameGetOutputCommand := preload("game/game_get_output_command.gd")
const GodotMcpGameRequestCommand := preload("game/game_request_command.gd")
const GodotMcpGameRunCommand := preload("game/game_run_command.gd")
const GodotMcpGameStopCommand := preload("game/game_stop_command.gd")
const GodotMcpGridMapGetCellsCommand := preload("grid/gridmap_get_cells_command.gd")
const GodotMcpGridMapSetCellsCommand := preload("grid/gridmap_set_cells_command.gd")
const GodotMcpMeshLibraryCreateCommand := preload("grid/meshlibrary_create_command.gd")
const GodotMcpHeldCommand := preload("held_command.gd")
const GodotMcpInputMapGetCommand := preload("input/input_map_get_command.gd")
const GodotMcpInputMapSetCommand := preload("input/input_map_set_command.gd")
const GodotMcpNavigationBakeCommand := preload("navigation/navigation_bake_command.gd")
const GodotMcpVoxelGiBakeCommand := preload("lighting/voxelgi_bake_command.gd")
const GodotMcpEditorVoxelGiBaker := preload("../editor/editor_voxel_gi_baker.gd")
const GodotMcpNavigationGetPathCommand := preload("navigation/navigation_get_path_command.gd")
const GodotMcpNodeAddCollisionCommand := preload("node/node_add_collision_command.gd")
const GodotMcpNodeAddCommand := preload("node/node_add_command.gd")
const GodotMcpNodeCallMethodCommand := preload("node/node_call_method_command.gd")
const GodotMcpNodeDeleteCommand := preload("node/node_delete_command.gd")
const GodotMcpNodeDuplicateCommand := preload("node/node_duplicate_command.gd")
const GodotMcpNodeFindCommand := preload("node/node_find_command.gd")
const GodotMcpNodeGetBoundsCommand := preload("node/node_get_bounds_command.gd")
const GodotMcpNodeGetPropertiesCommand := preload("node/node_get_properties_command.gd")
const GodotMcpNodeMakeLocalCommand := preload("node/node_make_local_command.gd")
const GodotMcpNodeReparentCommand := preload("node/node_reparent_command.gd")
const GodotMcpNodeSaveAsSceneCommand := preload("node/node_save_as_scene_command.gd")
const GodotMcpNodeSetGroupsCommand := preload("node/node_set_groups_command.gd")
const GodotMcpNodeSetPropertiesCommand := preload("node/node_set_properties_command.gd")
const GodotMcpNodeSnapToFloorCommand := preload("node/node_snap_to_floor_command.gd")
const GodotMcpPingCommand := preload("ping_command.gd")
const GodotMcpProjectInfoCommand := preload("project/project_info_command.gd")
const GodotMcpProjectSettingsGetCommand := preload("project/project_settings_get_command.gd")
const GodotMcpProjectSettingsSetCommand := preload("project/project_settings_set_command.gd")
const GodotMcpResourceCreateCommand := preload("resource/resource_create_command.gd")
const GodotMcpResourceFindUsagesCommand := preload("file/resource_find_usages_command.gd")
const GodotMcpResourceGetCommand := preload("resource/resource_get_command.gd")
const GodotMcpResourceSetPropertiesCommand := preload("resource/resource_set_properties_command.gd")
const GodotMcpDebugStepOutCommand := preload("game/debug_step_out_command.gd")
const GodotMcpGamePerformanceCommand := preload("game/game_performance_command.gd")
const GodotMcpRuntimeContext := preload("../runtime/runtime_context.gd")
const GodotMcpSceneBatchEditCommand := preload("scene/scene_batch_edit_command.gd")
const GodotMcpSceneCloseCommand := preload("scene/scene_close_command.gd")
const GodotMcpSceneCreateCommand := preload("scene/scene_create_command.gd")
const GodotMcpSceneGetTreeCommand := preload("scene/scene_get_tree_command.gd")
const GodotMcpSceneOpenCommand := preload("scene/scene_open_command.gd")
const GodotMcpSceneRaycastCommand := preload("scene/scene_raycast_command.gd")
const GodotMcpSceneSaveCommand := preload("scene/scene_save_command.gd")
const GodotMcpSignalConnectCommand := preload("signal/signal_connect_command.gd")
const GodotMcpSignalDisconnectCommand := preload("signal/signal_disconnect_command.gd")
const GodotMcpScriptFindInResourcesCommand := preload("script/script_find_in_resources_command.gd")
const GodotMcpScriptRenameInResourcesCommand := preload("script/script_rename_in_resources_command.gd")
const GodotMcpShaderValidateCommand := preload("shader/shader_validate_command.gd")
const GodotMcpSignalListCommand := preload("signal/signal_list_command.gd")
const GodotMcpTileMapGetCellsCommand := preload("grid/tilemap_get_cells_command.gd")
const GodotMcpTileMapSetCellsCommand := preload("grid/tilemap_set_cells_command.gd")
const GodotMcpTileSetAddAtlasCommand := preload("resource/tileset_add_atlas_command.gd")
const GodotMcpUnsafeCommand := preload("unsafe_command.gd")
const GodotMcpUserDataDeleteCommand := preload("project/user_data_delete_command.gd")
const GodotMcpUserDataGetCommand := preload("project/user_data_get_command.gd")

const METHODS_THAT_CHANGE := [
	"animation.delete",
	"animation.set",
	"animation_tree.set",
	"asset.import_settings_set",
	"audio.buses_set",
	"autoload.add",
	"autoload.remove",
	"editor.redo",
	"editor.reload_extensions",
	"editor.rescan",
	"editor.run_script",
	"editor.select",
	"editor.set_plugin_enabled",
	"editor.undo",
	"filesystem.delete",
	"filesystem.move",
	"game.eval",
	"game.input",
	"game.pause",
	"game.run",
	"game.set_properties",
	"game.step",
	"gridmap.set_cells",
	"meshlibrary.create",
	"input_map.set",
	"navigation.bake",
	"node.add",
	"node.add_collision",
	"node.call_method",
	"node.delete",
	"node.duplicate",
	"node.make_local",
	"node.reparent",
	"node.save_as_scene",
	"node.set_groups",
	"node.set_properties",
	"node.snap_to_floor",
	"project.settings_set",
	"project.user_data_delete",
	"resource.create",
	"resource.set_properties",
	"scene.batch_edit",
	"scene.close",
	"scene.create",
	"scene.open",
	"scene.save",
	"script.rename_in_resources",
	"signal.connect",
	"signal.disconnect",
	"tilemap.set_cells",
	"tileset.add_atlas",
	"voxelgi.bake",
]
const INSPECTION_TIMEOUT_MSEC := 10_000
const WAIT_TIMEOUT_MSEC := 65_000
const INPUT_TIMEOUT_MSEC := 300_000
const SCREENSHOT_TIMEOUT_MSEC := 30_000


static func build_router(context: GodotMcpEditingContext, runtime: GodotMcpRuntimeContext, read_indentation: Callable, save_project_settings: Callable, autoloads: GodotMcpAutoloadRegistry, is_unsafe_allowed: Callable, is_changes_held: Callable) -> GodotMcpCommandRouter:
	var captures := ProjectSettings.globalize_path("res://").path_join(GodotMcpAddonInfo.CAPTURES_RELATIVE_PATH)
	var file_system := GodotMcpEditorFileSystemAccess.new()
	var extensions := GodotMcpEditorExtensionAccess.new()
	var router := GodotMcpCommandRouter.new()
	router.register("ping", GodotMcpPingCommand.new(is_changes_held))
	router.register("project.info", GodotMcpProjectInfoCommand.new(read_indentation))
	router.register("shader.validate", GodotMcpShaderValidateCommand.new())
	router.register("script.find_in_resources", GodotMcpScriptFindInResourcesCommand.new())
	router.register("script.rename_in_resources", GodotMcpScriptRenameInResourcesCommand.new(context))
	router.register("project.settings_get", GodotMcpProjectSettingsGetCommand.new(context.codec))
	router.register("project.user_data_get", GodotMcpUserDataGetCommand.new())
	router.register("project.settings_set", GodotMcpProjectSettingsSetCommand.new(context.codec, save_project_settings))
	router.register("autoload.add", GodotMcpAutoloadAddCommand.new(autoloads, save_project_settings))
	router.register("autoload.remove", GodotMcpAutoloadRemoveCommand.new(autoloads, save_project_settings))
	router.register("editor.reload_extensions", GodotMcpEditorReloadExtensionsCommand.new(extensions))
	router.register("editor.rescan", GodotMcpEditorRescanCommand.new(file_system, GodotMcpEditorScriptEditorAccess.new(), extensions))
	router.register("editor.screenshot", GodotMcpEditorScreenshotCommand.new(context, GodotMcpEditorViewportAccess.new(), captures))
	router.register("editor.select", GodotMcpEditorSelectCommand.new(context))
	router.register("editor.set_plugin_enabled", GodotMcpEditorSetPluginEnabledCommand.new(GodotMcpEditorPluginAccess.new(), save_project_settings))
	router.register("editor.undo", GodotMcpEditorUndoCommand.new(context))
	router.register("editor.redo", GodotMcpEditorRedoCommand.new(context))
	router.register("editor.get_state", GodotMcpEditorGetStateCommand.new(context))
	router.register("editor.unsaved_files", GodotMcpEditorUnsavedFilesCommand.new(context, GodotMcpEditorScriptEditorAccess.new()))
	router.register("editor.breakpoints", GodotMcpEditorBreakpointsCommand.new(GodotMcpEditorScriptEditorAccess.new()))
	router.register("asset.import_settings_get", GodotMcpAssetImportSettingsGetCommand.new(context.codec))
	router.register("asset.import_settings_set", GodotMcpAssetImportSettingsSetCommand.new(context.codec, file_system))
	router.register("animation.get", GodotMcpAnimationGetCommand.new(context))
	router.register("animation.set", GodotMcpAnimationSetCommand.new(context))
	router.register("animation.delete", GodotMcpAnimationDeleteCommand.new(context))
	router.register("resource.find_usages", GodotMcpResourceFindUsagesCommand.new())
	router.register("filesystem.move", GodotMcpFilesystemMoveCommand.new(context, file_system, save_project_settings))
	router.register("animation_tree.get", GodotMcpAnimationTreeGetCommand.new(context))
	router.register("animation_tree.set", GodotMcpAnimationTreeSetCommand.new(context))
	router.register("navigation.bake", GodotMcpNavigationBakeCommand.new(context))
	router.register("voxelgi.bake", GodotMcpVoxelGiBakeCommand.new(context, GodotMcpEditorVoxelGiBaker.new()))
	router.register("navigation.get_path", GodotMcpNavigationGetPathCommand.new(context, GodotMcpGameRequestCommand.new(runtime, "navigation_path", INSPECTION_TIMEOUT_MSEC)))
	router.register("input_map.get", GodotMcpInputMapGetCommand.new())
	router.register("input_map.set", GodotMcpInputMapSetCommand.new(save_project_settings))
	router.register("audio.buses_get", GodotMcpAudioBusesGetCommand.new(GodotMcpAudioBusLayoutFile.new(file_system)))
	router.register("audio.buses_set", GodotMcpAudioBusesSetCommand.new(GodotMcpAudioBusLayoutFile.new(file_system)))
	router.register("scene.create", GodotMcpSceneCreateCommand.new(context))
	router.register("scene.open", GodotMcpSceneOpenCommand.new(context))
	router.register("scene.save", GodotMcpSceneSaveCommand.new(context))
	router.register("scene.close", GodotMcpSceneCloseCommand.new(context))
	router.register("scene.get_tree", GodotMcpSceneGetTreeCommand.new(context))
	router.register("scene.batch_edit", GodotMcpSceneBatchEditCommand.new(context))
	router.register("scene.raycast", GodotMcpSceneRaycastCommand.new(context, GodotMcpGameRequestCommand.new(runtime, "raycast", INSPECTION_TIMEOUT_MSEC)))
	router.register("node.snap_to_floor", GodotMcpNodeSnapToFloorCommand.new(context))
	router.register("node.add", GodotMcpNodeAddCommand.new(context))
	router.register("node.add_collision", GodotMcpNodeAddCollisionCommand.new(context))
	router.register("node.delete", GodotMcpNodeDeleteCommand.new(context))
	router.register("node.duplicate", GodotMcpNodeDuplicateCommand.new(context))
	router.register("node.reparent", GodotMcpNodeReparentCommand.new(context))
	router.register("node.save_as_scene", GodotMcpNodeSaveAsSceneCommand.new(context))
	router.register("node.make_local", GodotMcpNodeMakeLocalCommand.new(context))
	router.register("node.find", GodotMcpNodeFindCommand.new(context))
	router.register("node.get_properties", GodotMcpNodeGetPropertiesCommand.new(context))
	router.register("node.get_bounds", GodotMcpNodeGetBoundsCommand.new(context, GodotMcpGameRequestCommand.new(runtime, "bounds", INSPECTION_TIMEOUT_MSEC)))
	router.register("node.set_properties", GodotMcpNodeSetPropertiesCommand.new(context))
	router.register("node.set_groups", GodotMcpNodeSetGroupsCommand.new(context))
	router.register("gridmap.get_cells", GodotMcpGridMapGetCellsCommand.new(context))
	router.register("gridmap.set_cells", GodotMcpGridMapSetCellsCommand.new(context))
	router.register("meshlibrary.create", GodotMcpMeshLibraryCreateCommand.new(GodotMcpEditorMeshPreviewAccess.new()))
	router.register("tilemap.get_cells", GodotMcpTileMapGetCellsCommand.new(context))
	router.register("tilemap.set_cells", GodotMcpTileMapSetCellsCommand.new(context))
	router.register("signal.list", GodotMcpSignalListCommand.new(context))
	router.register("signal.connect", GodotMcpSignalConnectCommand.new(context))
	router.register("signal.disconnect", GodotMcpSignalDisconnectCommand.new(context))
	router.register("resource.create", GodotMcpResourceCreateCommand.new(context))
	router.register("resource.get", GodotMcpResourceGetCommand.new(context))
	router.register("resource.set_properties", GodotMcpResourceSetPropertiesCommand.new(context))
	router.register("tileset.add_atlas", GodotMcpTileSetAddAtlasCommand.new())
	router.register("game.run", GodotMcpGameRunCommand.new(context, runtime))
	router.register("game.stop", GodotMcpGameStopCommand.new(runtime))
	router.register("debug.step_out", GodotMcpDebugStepOutCommand.new(runtime.channel))
	router.register("game.get_output", GodotMcpGameGetOutputCommand.new(runtime))
	router.register("game.get_tree", GodotMcpGameRequestCommand.new(runtime, "tree", INSPECTION_TIMEOUT_MSEC))
	router.register("game.get_properties", GodotMcpGameRequestCommand.new(runtime, "properties.get", INSPECTION_TIMEOUT_MSEC))
	router.register("game.set_properties", GodotMcpGameRequestCommand.new(runtime, "properties.set", INSPECTION_TIMEOUT_MSEC))
	router.register("game.wait", GodotMcpGameRequestCommand.new(runtime, "wait", WAIT_TIMEOUT_MSEC, true))
	router.register("game.input", GodotMcpGameRequestCommand.new(runtime, "input", INPUT_TIMEOUT_MSEC, true))
	router.register("game.record_input", GodotMcpGameRequestCommand.new(runtime, "record_input", INSPECTION_TIMEOUT_MSEC))
	router.register("game.screenshot", GodotMcpGameRequestCommand.new(runtime, "screenshot", SCREENSHOT_TIMEOUT_MSEC, true))
	router.register("game.pause", GodotMcpGameRequestCommand.new(runtime, "pause", INSPECTION_TIMEOUT_MSEC))
	router.register("game.step", GodotMcpGameRequestCommand.new(runtime, "step", WAIT_TIMEOUT_MSEC, true))
	router.register("game.audio_levels", GodotMcpGameRequestCommand.new(runtime, "audio_levels", WAIT_TIMEOUT_MSEC))
	router.register("game.performance", GodotMcpGamePerformanceCommand.new(GodotMcpGameRequestCommand.new(runtime, "performance", WAIT_TIMEOUT_MSEC, true), runtime, _script_editor_debuggers))
	router.register("game.eval", GodotMcpUnsafeCommand.new(GodotMcpGameRequestCommand.new(runtime, "eval", INSPECTION_TIMEOUT_MSEC), is_unsafe_allowed))
	router.register("editor.run_script", GodotMcpUnsafeCommand.new(GodotMcpEditorRunScriptCommand.new(context), is_unsafe_allowed))
	router.register("node.call_method", GodotMcpUnsafeCommand.new(GodotMcpNodeCallMethodCommand.new(context), is_unsafe_allowed))
	router.register("filesystem.delete", GodotMcpUnsafeCommand.new(GodotMcpFilesystemDeleteCommand.new(context, file_system, GodotMcpFileTrash.new(), save_project_settings), is_unsafe_allowed))
	router.register("project.user_data_delete", GodotMcpUnsafeCommand.new(GodotMcpUserDataDeleteCommand.new(GodotMcpFileTrash.new()), is_unsafe_allowed))
	hold_changes_of(router, is_changes_held)
	return router


static func hold_changes_of(router: GodotMcpCommandRouter, is_changes_held: Callable) -> void:
	for method: String in METHODS_THAT_CHANGE:
		var command := router.find(method)
		if command != null:
			router.register(method, GodotMcpHeldCommand.new(command, is_changes_held))


static func _script_editor_debuggers() -> Array:
	return EditorInterface.get_base_control().find_children("*", "ScriptEditorDebugger", true, false)
