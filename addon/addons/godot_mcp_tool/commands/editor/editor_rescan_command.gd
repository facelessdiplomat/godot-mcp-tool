extends "../command.gd"

const FileSystemAccess := preload("../../editor/file_system_access.gd")
const Params := preload("../params.gd")
const ScriptEditorAccess := preload("../../editor/script_editor_access.gd")
const Waiting := preload("../../util/waiting.gd")

const DEFAULT_TIMEOUT_MSEC := 60_000

var _file_system: FileSystemAccess
var _scripts: ScriptEditorAccess


func _init(file_system: FileSystemAccess, scripts: ScriptEditorAccess) -> void:
	_file_system = file_system
	_scripts = scripts


func execute(params: Dictionary) -> Variant:
	var timeout_msec: Variant = Params.whole_number(params, "timeout_ms", DEFAULT_TIMEOUT_MSEC)
	if timeout_msec is CommandError:
		return timeout_msec
	var started_msec := Time.get_ticks_msec()
	var applied_before := _file_system.applied_scans()
	if not _file_system.is_scanning():
		_file_system.scan()
	if not await Waiting.until(func() -> bool: return _file_system.applied_scans() != applied_before, timeout_msec):
		return CommandError.new(JsonRpc.TIMEOUT, "The file system scan did not finish within %d ms" % timeout_msec, "Large projects may need a longer timeout_ms.")
	await _scripts.reload_open_files()
	return {"duration_ms": Time.get_ticks_msec() - started_msec}
