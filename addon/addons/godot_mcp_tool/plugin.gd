@tool
extends EditorPlugin

const AddonInfo := preload("addon_info.gd")
const Authenticator := preload("bridge/authenticator.gd")
const BridgeServer := preload("bridge/bridge_server.gd")
const BridgeSession := preload("bridge/bridge_session.gd")
const CommandCatalog := preload("commands/command_catalog.gd")
const CommandRouter := preload("commands/command_router.gd")
const DiscoveryFile := preload("bridge/discovery_file.gd")
const EditingContext := preload("scene/editing_context.gd")
const EditorSceneAccess := preload("scene/editor_scene_access.gd")
const EditorScriptEditorAccess := preload("editor/editor_script_editor_access.gd")
const EditorGameLauncher := preload("runtime/editor_game_launcher.gd")
const EditorUndoHistory := preload("scene/editor_undo_history.gd")
const GameState := preload("runtime/game_state.gd")
const GodotVersionText := preload("editor/godot_version_text.gd")
const LogStore := preload("runtime/log_store.gd")
const ResponsivenessController := preload("editor/responsiveness_controller.gd")
const RunArguments := preload("runtime/run_arguments.gd")
const RuntimeContext := preload("runtime/runtime_context.gd")
const RuntimeDebugger := preload("runtime/runtime_debugger.gd")
const RuntimeLogger := preload("runtime/runtime_logger.gd")
const TokenGenerator := preload("bridge/token_generator.gd")
const VariantCodec := preload("codec/variant_codec.gd")

const LANGUAGE_SERVER_PORT_SETTING := "network/language_server/remote_port"
const INDENT_TYPE_SETTING := "text_editor/behavior/indent/type"
const INDENT_SIZE_SETTING := "text_editor/behavior/indent/size"
const SPACES_INDENT_TYPE := 1
const AUTOLOAD_PREFIX := "autoload/"
const RUNTIME_AUTOLOAD_NAME := "GodotMcpRuntime"
const RUNTIME_AGENT_FILE := "runtime/runtime_agent.gd"
const EDITOR_SOURCE := "editor"

var _runtime: RuntimeContext
var _runtime_debugger: RuntimeDebugger
var _editor_logger: RuntimeLogger
var _router: CommandRouter
var _bridge_server: BridgeServer
var _discovery_file: DiscoveryFile
var _token := ""


func _enter_tree() -> void:
	var log_store := LogStore.new()
	var game := GameState.new()
	_runtime_debugger = RuntimeDebugger.new(game, log_store)
	add_debugger_plugin(_runtime_debugger)
	_runtime = RuntimeContext.new(game, log_store, EditorGameLauncher.new(), _runtime_debugger.channel)
	_editor_logger = RuntimeLogger.new(false)
	OS.add_logger(_editor_logger)
	_ensure_runtime_autoload()
	var context := EditingContext.new(EditorSceneAccess.new(), EditorUndoHistory.new(get_undo_redo()), VariantCodec.new(), EditorScriptEditorAccess.new())
	_router = CommandCatalog.build_router(context, _runtime, _read_indentation, ProjectSettings.save)
	_token = TokenGenerator.generate()
	_bridge_server = BridgeServer.new(_create_session)
	var listen_error := _bridge_server.listen(AddonInfo.LOOPBACK_ADDRESS, 0)
	if listen_error != OK:
		push_error("Godot MCP Tool: the bridge could not listen on %s: %s" % [AddonInfo.LOOPBACK_ADDRESS, error_string(listen_error)])
		_bridge_server = null
		return
	_discovery_file = DiscoveryFile.new(_project_path().path_join(AddonInfo.DISCOVERY_RELATIVE_PATH))
	var write_error := _discovery_file.write(_build_discovery_record())
	if write_error != OK:
		push_error("Godot MCP Tool: could not write %s: %s" % [_discovery_file.path, error_string(write_error)])
		return
	print("Godot MCP Tool: bridge listening on %s:%d" % [AddonInfo.LOOPBACK_ADDRESS, _bridge_server.get_port()])


func _process(_delta: float) -> void:
	_collect_editor_log()
	if _bridge_server == null:
		return
	_bridge_server.poll()
	ResponsivenessController.update(_bridge_server.last_activity_msec)


func _exit_tree() -> void:
	if _bridge_server != null:
		_bridge_server.stop()
		_bridge_server = null
	if _discovery_file != null:
		_discovery_file.remove()
		_discovery_file = null
	if _runtime_debugger != null:
		remove_debugger_plugin(_runtime_debugger)
		_runtime_debugger = null
	if _editor_logger != null:
		OS.remove_logger(_editor_logger)
		_editor_logger = null


func _disable_plugin() -> void:
	if ProjectSettings.has_setting(AUTOLOAD_PREFIX + RUNTIME_AUTOLOAD_NAME):
		remove_autoload_singleton(RUNTIME_AUTOLOAD_NAME)


func _run_scene(_scene: String, args: PackedStringArray) -> PackedStringArray:
	var is_agent_run := _runtime != null and _runtime.game.take_agent_run_request()
	return RunArguments.extend(args, is_agent_run, DisplayServer.get_name() == "headless")


func _create_session() -> BridgeSession:
	return BridgeSession.new(Authenticator.new(_token, AddonInfo.BRIDGE_PROTOCOL_VERSION), _router, _build_hello_payload, _read_status)


func _read_status() -> Dictionary:
	_collect_editor_log()
	var status := _runtime.log_store.status()
	status["game"] = _runtime.game.state
	return status


func _collect_editor_log() -> void:
	if _editor_logger == null:
		return
	for entry in _editor_logger.take_pending():
		_runtime.log_store.append(entry, EDITOR_SOURCE)


func _ensure_runtime_autoload() -> void:
	var agent_path := (get_script() as Script).resource_path.get_base_dir().path_join(RUNTIME_AGENT_FILE)
	var setting := AUTOLOAD_PREFIX + RUNTIME_AUTOLOAD_NAME
	if ProjectSettings.has_setting(setting) and str(ProjectSettings.get_setting(setting)).trim_prefix("*") == agent_path:
		return
	add_autoload_singleton(RUNTIME_AUTOLOAD_NAME, agent_path)
	_place_autoload_first(setting)
	ProjectSettings.save()


static func _place_autoload_first(setting: String) -> void:
	var first_order := ProjectSettings.get_order(setting)
	for property in ProjectSettings.get_property_list():
		var property_name := str(property["name"])
		if property_name.begins_with(AUTOLOAD_PREFIX) and property_name != setting:
			first_order = mini(first_order, ProjectSettings.get_order(property_name))
	if first_order < ProjectSettings.get_order(setting):
		ProjectSettings.set_order(setting, first_order - 1)


func _build_hello_payload() -> Dictionary:
	var available_methods := PackedStringArray(["hello"])
	available_methods.append_array(_router.methods())
	return {
		"protocol": AddonInfo.BRIDGE_PROTOCOL_VERSION,
		"godot_version": GodotVersionText.from_version_info(Engine.get_version_info()),
		"addon_version": AddonInfo.ADDON_VERSION,
		"project_path": _project_path(),
		"executable_path": OS.get_executable_path(),
		"methods": available_methods,
	}


func _build_discovery_record() -> Dictionary:
	return {
		"protocol": AddonInfo.BRIDGE_PROTOCOL_VERSION,
		"port": _bridge_server.get_port(),
		"token": _token,
		"pid": OS.get_process_id(),
		"godot_version": GodotVersionText.from_version_info(Engine.get_version_info()),
		"addon_version": AddonInfo.ADDON_VERSION,
		"project_path": _project_path(),
		"executable_path": OS.get_executable_path(),
		"lsp_port": int(EditorInterface.get_editor_settings().get_setting(LANGUAGE_SERVER_PORT_SETTING)),
		"started_at": Time.get_datetime_string_from_system(true) + "Z",
	}


func _read_indentation() -> Dictionary:
	var settings := EditorInterface.get_editor_settings()
	var uses_spaces := int(settings.get_setting(INDENT_TYPE_SETTING)) == SPACES_INDENT_TYPE
	return {"style": "spaces" if uses_spaces else "tabs", "size": int(settings.get_setting(INDENT_SIZE_SETTING))}


func _project_path() -> String:
	return ProjectSettings.globalize_path("res://").trim_suffix("/")
