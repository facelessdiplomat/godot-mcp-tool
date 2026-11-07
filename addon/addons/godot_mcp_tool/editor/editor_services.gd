extends RefCounted

const GodotMcpAddonInfo := preload("../addon_info.gd")
const GodotMcpAuthenticator := preload("../bridge/authenticator.gd")
const GodotMcpBottomPanel := preload("bottom_panel.gd")
const GodotMcpBridgeServer := preload("../bridge/bridge_server.gd")
const GodotMcpBridgeSession := preload("../bridge/bridge_session.gd")
const GodotMcpCommandCatalog := preload("../commands/command_catalog.gd")
const GodotMcpCommandJournal := preload("command_journal.gd")
const GodotMcpCommandRouter := preload("../commands/command_router.gd")
const GodotMcpDiscoveryFile := preload("../bridge/discovery_file.gd")
const GodotMcpEditingContext := preload("../scene/editing_context.gd")
const GodotMcpEditorAutoloadRegistry := preload("editor_autoload_registry.gd")
const GodotMcpEditorFileSystemAccess := preload("editor_file_system_access.gd")
const GodotMcpEditorGameLauncher := preload("../runtime/editor_game_launcher.gd")
const GodotMcpEditorSceneAccess := preload("../scene/editor_scene_access.gd")
const GodotMcpEditorScriptEditorAccess := preload("editor_script_editor_access.gd")
const GodotMcpEditorUndoHistory := preload("../scene/editor_undo_history.gd")
const GodotMcpFirstScanGate := preload("first_scan_gate.gd")
const GodotMcpGameState := preload("../runtime/game_state.gd")
const GodotMcpGodotVersionText := preload("godot_version_text.gd")
const GodotMcpLogStore := preload("../runtime/log_store.gd")
const GodotMcpMcpDock := preload("mcp_dock.gd")
const GodotMcpResponsivenessController := preload("responsiveness_controller.gd")
const GodotMcpRunArguments := preload("../runtime/run_arguments.gd")
const GodotMcpRunRequest := preload("../runtime/run_request.gd")
const GodotMcpRuntimeContext := preload("../runtime/runtime_context.gd")
const GodotMcpRuntimeDebugger := preload("../runtime/runtime_debugger.gd")
const GodotMcpRuntimeLogger := preload("../runtime/runtime_logger.gd")
const GodotMcpTokenGenerator := preload("../bridge/token_generator.gd")
const GodotMcpUnsafeToolsSwitch := preload("unsafe_tools_switch.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const LANGUAGE_SERVER_PORT_SETTING := "network/language_server/remote_port"
const DEBUG_ADAPTER_PORT_SETTING := "network/debug_adapter/remote_port"
const INDENT_TYPE_SETTING := "text_editor/behavior/indent/type"
const INDENT_SIZE_SETTING := "text_editor/behavior/indent/size"
const SPACES_INDENT_TYPE := 1
const AUTOLOAD_PREFIX := "autoload/"
const RUNTIME_AGENT_FILE := "runtime/runtime_agent.gd"
const EDITOR_SOURCE := "editor"

var _plugin: EditorPlugin
var _runtime: GodotMcpRuntimeContext
var _runtime_debugger: GodotMcpRuntimeDebugger
var _editor_logger: GodotMcpRuntimeLogger
var _router: GodotMcpCommandRouter
var _bridge_server: GodotMcpBridgeServer
var _discovery_file: GodotMcpDiscoveryFile
var _first_scan_gate: GodotMcpFirstScanGate
var _token := ""
var _unsafe_tools := GodotMcpUnsafeToolsSwitch.new()
var _command_journal := GodotMcpCommandJournal.new()
var _bridge_state := ""
var _dock_panel: GodotMcpBottomPanel


func _init(plugin: EditorPlugin) -> void:
	_plugin = plugin


func start() -> void:
	var log_store := GodotMcpLogStore.new()
	var game := GodotMcpGameState.new()
	_runtime_debugger = GodotMcpRuntimeDebugger.new(game, log_store)
	_plugin.add_debugger_plugin(_runtime_debugger)
	_runtime = GodotMcpRuntimeContext.new(game, log_store, GodotMcpEditorGameLauncher.new(), _runtime_debugger.channel)
	_editor_logger = GodotMcpRuntimeLogger.new(false)
	OS.add_logger(_editor_logger)
	_ensure_runtime_autoload()
	var context := GodotMcpEditingContext.new(GodotMcpEditorSceneAccess.new(), GodotMcpEditorUndoHistory.new(_plugin.get_undo_redo()), GodotMcpVariantCodec.new(), GodotMcpEditorScriptEditorAccess.new())
	_unsafe_tools.install(_plugin)
	_router = GodotMcpCommandCatalog.build_router(context, _runtime, _read_indentation, ProjectSettings.save, GodotMcpEditorAutoloadRegistry.new(_plugin), _unsafe_tools.is_allowed)
	_token = GodotMcpTokenGenerator.generate()
	_first_scan_gate = GodotMcpFirstScanGate.new(GodotMcpEditorFileSystemAccess.new())
	_bridge_state = _start_bridge()
	var dock := GodotMcpMcpDock.new(_command_journal, _read_dock_status, _unsafe_tools.is_allowed, _unsafe_tools.set_allowed)
	_dock_panel = GodotMcpBottomPanel.new(_plugin, dock)
	_dock_panel.add(GodotMcpMcpDock.TAB_TITLE)


func process() -> void:
	_collect_editor_log()
	if _bridge_server == null:
		return
	_bridge_server.poll()
	GodotMcpResponsivenessController.update(_bridge_server.last_activity_msec)


func stop() -> void:
	if _dock_panel != null:
		_dock_panel.remove()
		_dock_panel = null
	_unsafe_tools.uninstall(_plugin)
	if _bridge_server != null:
		_bridge_server.stop()
		_bridge_server = null
	if _discovery_file != null:
		_discovery_file.release(OS.get_process_id())
		_discovery_file = null
	if _runtime_debugger != null:
		_plugin.remove_debugger_plugin(_runtime_debugger)
		_runtime_debugger = null
	if _editor_logger != null:
		OS.remove_logger(_editor_logger)
		_editor_logger = null


func run_arguments(args: PackedStringArray) -> PackedStringArray:
	var agent_run: GodotMcpRunRequest = _runtime.game.take_agent_run_request()
	return GodotMcpRunArguments.extend(args, agent_run, DisplayServer.get_name() == "headless")


func _start_bridge() -> String:
	_bridge_server = GodotMcpBridgeServer.new(_create_session)
	var listen_error := _bridge_server.listen(GodotMcpAddonInfo.LOOPBACK_ADDRESS, 0)
	if listen_error != OK:
		push_error("Godot MCP Tool: the bridge could not listen on %s: %s" % [GodotMcpAddonInfo.LOOPBACK_ADDRESS, error_string(listen_error)])
		_bridge_server = null
		return "off: it could not listen on %s (%s)" % [GodotMcpAddonInfo.LOOPBACK_ADDRESS, error_string(listen_error)]
	var discovery_file := GodotMcpDiscoveryFile.new(_project_path().path_join(GodotMcpAddonInfo.DISCOVERY_RELATIVE_PATH))
	var claim_error := discovery_file.claim(_build_discovery_record())
	if claim_error == ERR_ALREADY_IN_USE:
		print("Godot MCP Tool: the editor in process %d already serves this project, so this one keeps its bridge off." % discovery_file.owner_pid())
		_bridge_server.stop()
		_bridge_server = null
		return "off: the editor in process %d already serves this project" % discovery_file.owner_pid()
	var address := "%s:%d" % [GodotMcpAddonInfo.LOOPBACK_ADDRESS, _bridge_server.get_port()]
	if claim_error != OK:
		push_error("Godot MCP Tool: could not write %s: %s" % [discovery_file.path, error_string(claim_error)])
		return "listening on %s, but no server finds it: %s could not be written" % [address, discovery_file.path]
	_discovery_file = discovery_file
	print("Godot MCP Tool: bridge listening on %s" % address)
	return "listening on %s" % address


func _create_session() -> GodotMcpBridgeSession:
	return GodotMcpBridgeSession.new(
		GodotMcpAuthenticator.new(_token, GodotMcpAddonInfo.BRIDGE_PROTOCOL_VERSION),
		_router,
		_build_hello_payload,
		_read_status,
		_first_scan_gate.wait_until_finished,
		_command_journal.record)


func _read_dock_status() -> Dictionary:
	return {
		"bridge": _bridge_state,
		"clients": _bridge_server.authenticated_count() if _bridge_server != null else 0,
		"game": _runtime.game.state,
	}


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
	var agent_path := (_plugin.get_script() as Script).resource_path.get_base_dir().path_join(RUNTIME_AGENT_FILE)
	var setting := AUTOLOAD_PREFIX + GodotMcpAddonInfo.RUNTIME_AUTOLOAD_NAME
	if ProjectSettings.has_setting(setting) and str(ProjectSettings.get_setting(setting)).trim_prefix("*") == agent_path:
		return
	_plugin.add_autoload_singleton(GodotMcpAddonInfo.RUNTIME_AUTOLOAD_NAME, agent_path)
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
		"protocol": GodotMcpAddonInfo.BRIDGE_PROTOCOL_VERSION,
		"godot_version": GodotMcpGodotVersionText.from_version_info(Engine.get_version_info()),
		"addon_version": GodotMcpAddonInfo.ADDON_VERSION,
		"project_path": _project_path(),
		"executable_path": OS.get_executable_path(),
		"methods": available_methods,
	}


func _build_discovery_record() -> Dictionary:
	return {
		"protocol": GodotMcpAddonInfo.BRIDGE_PROTOCOL_VERSION,
		"port": _bridge_server.get_port(),
		"token": _token,
		"pid": OS.get_process_id(),
		"godot_version": GodotMcpGodotVersionText.from_version_info(Engine.get_version_info()),
		"addon_version": GodotMcpAddonInfo.ADDON_VERSION,
		"project_path": _project_path(),
		"executable_path": OS.get_executable_path(),
		"lsp_port": int(EditorInterface.get_editor_settings().get_setting(LANGUAGE_SERVER_PORT_SETTING)),
		"dap_port": int(EditorInterface.get_editor_settings().get_setting(DEBUG_ADAPTER_PORT_SETTING)),
		"started_at": Time.get_datetime_string_from_system(true) + "Z",
	}


func _read_indentation() -> Dictionary:
	var settings := EditorInterface.get_editor_settings()
	var uses_spaces := int(settings.get_setting(INDENT_TYPE_SETTING)) == SPACES_INDENT_TYPE
	return {"style": "spaces" if uses_spaces else "tabs", "size": int(settings.get_setting(INDENT_SIZE_SETTING))}


func _project_path() -> String:
	return ProjectSettings.globalize_path("res://").trim_suffix("/")
