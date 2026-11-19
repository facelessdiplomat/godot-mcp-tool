extends "../command.gd"

const GodotMcpExtensionAccess := preload("../../editor/extension_access.gd")
const GodotMcpFileSystemAccess := preload("../../editor/file_system_access.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpScriptEditorAccess := preload("../../editor/script_editor_access.gd")
const GodotMcpWaiting := preload("../../util/waiting.gd")

const DEFAULT_TIMEOUT_MSEC := 60_000

var _file_system: GodotMcpFileSystemAccess
var _scripts: GodotMcpScriptEditorAccess
var _extensions: GodotMcpExtensionAccess


func _init(file_system: GodotMcpFileSystemAccess, scripts: GodotMcpScriptEditorAccess, extensions: GodotMcpExtensionAccess) -> void:
	_file_system = file_system
	_scripts = scripts
	_extensions = extensions


func execute(params: Dictionary) -> Variant:
	var timeout_msec: Variant = GodotMcpParams.whole_number(params, "timeout_ms", DEFAULT_TIMEOUT_MSEC)
	if timeout_msec is GodotMcpCommandError:
		return timeout_msec
	var started_msec := Time.get_ticks_msec()
	var reloaded_extensions := _extensions.take_reloaded()
	while true:
		if _file_system.is_scanning():
			if not await _wait_for_a_scan_after(_file_system.applied_scans(), started_msec, timeout_msec):
				return _timeout_error(timeout_msec)
			continue
		var applied_before := _file_system.applied_scans()
		_file_system.scan()
		var scan_started := _file_system.is_scanning() or _file_system.applied_scans() != applied_before
		if not await _wait_for_a_scan_after(applied_before, started_msec, timeout_msec):
			return _timeout_error(timeout_msec)
		if scan_started:
			break
	await _scripts.reload_open_files()
	var reloaded_scripts := _scripts.reload_changed_closed_scripts()
	return {"duration_ms": Time.get_ticks_msec() - started_msec, "reloaded_extensions": reloaded_extensions, "reloaded_scripts": reloaded_scripts}


func _wait_for_a_scan_after(applied_before: int, started_msec: int, timeout_msec: int) -> bool:
	var remaining_msec := maxi(timeout_msec - (Time.get_ticks_msec() - started_msec), 1)
	return await GodotMcpWaiting.until(func() -> bool: return _file_system.applied_scans() != applied_before, remaining_msec)


static func _timeout_error(timeout_msec: int) -> GodotMcpCommandError:
	return GodotMcpCommandError.new(GodotMcpJsonRpc.TIMEOUT, "The file system scan did not finish within %d ms" % timeout_msec, "Large projects may need a longer timeout_ms.")
