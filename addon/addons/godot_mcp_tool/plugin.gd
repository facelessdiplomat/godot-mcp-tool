@tool
extends EditorPlugin

const AddonInfo := preload("addon_info.gd")
const Authenticator := preload("bridge/authenticator.gd")
const BridgeServer := preload("bridge/bridge_server.gd")
const BridgeSession := preload("bridge/bridge_session.gd")
const CommandRouter := preload("commands/command_router.gd")
const DiscoveryFile := preload("bridge/discovery_file.gd")
const GodotVersionText := preload("editor/godot_version_text.gd")
const PingCommand := preload("commands/ping_command.gd")
const TokenGenerator := preload("bridge/token_generator.gd")

const LANGUAGE_SERVER_PORT_SETTING := "network/language_server/remote_port"

var _router := CommandRouter.new()
var _bridge_server: BridgeServer
var _discovery_file: DiscoveryFile
var _token := ""


func _enter_tree() -> void:
	_router.register("ping", PingCommand.new())
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
	if _bridge_server != null:
		_bridge_server.poll()


func _exit_tree() -> void:
	if _bridge_server != null:
		_bridge_server.stop()
		_bridge_server = null
	if _discovery_file != null:
		_discovery_file.remove()
		_discovery_file = null


func _create_session() -> BridgeSession:
	return BridgeSession.new(Authenticator.new(_token, AddonInfo.BRIDGE_PROTOCOL_VERSION), _router, _build_hello_payload)


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


func _project_path() -> String:
	return ProjectSettings.globalize_path("res://").trim_suffix("/")
