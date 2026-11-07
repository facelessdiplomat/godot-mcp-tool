extends "../command.gd"

const GodotMcpFileSystemAccess := preload("../../editor/file_system_access.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpScriptEditorAccess := preload("../../editor/script_editor_access.gd")
const GodotMcpWaiting := preload("../../util/waiting.gd")

const DEFAULT_TIMEOUT_MSEC := 60_000

var _file_system: GodotMcpFileSystemAccess
var _scripts: GodotMcpScriptEditorAccess


func _init(file_system: GodotMcpFileSystemAccess, scripts: GodotMcpScriptEditorAccess) -> void:
	_file_system = file_system
	_scripts = scripts


func execute(params: Dictionary) -> Variant:
	var timeout_msec: Variant = GodotMcpParams.whole_number(params, "timeout_ms", DEFAULT_TIMEOUT_MSEC)
	if timeout_msec is GodotMcpCommandError:
		return timeout_msec
	var started_msec := Time.get_ticks_msec()
	var applied_before := _file_system.applied_scans()
	if not _file_system.is_scanning():
		_file_system.scan()
	if not await GodotMcpWaiting.until(func() -> bool: return _file_system.applied_scans() != applied_before, timeout_msec):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.TIMEOUT, "The file system scan did not finish within %d ms" % timeout_msec, "Large projects may need a longer timeout_ms.")
	await _scripts.reload_open_files()
	return {"duration_ms": Time.get_ticks_msec() - started_msec}
