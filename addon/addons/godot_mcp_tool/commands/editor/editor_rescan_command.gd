extends "../command.gd"

const Params := preload("../params.gd")

const DEFAULT_TIMEOUT_MSEC := 60_000


func execute(params: Dictionary) -> Variant:
	var timeout_msec: Variant = Params.whole_number(params, "timeout_ms", DEFAULT_TIMEOUT_MSEC)
	if timeout_msec is CommandError:
		return timeout_msec
	var started_msec := Time.get_ticks_msec()
	var filesystem := EditorInterface.get_resource_filesystem()
	if not filesystem.is_scanning():
		filesystem.scan()
	while filesystem.is_scanning():
		if Time.get_ticks_msec() - started_msec > timeout_msec:
			return CommandError.new(JsonRpc.TIMEOUT, "The file system scan did not finish within %d ms" % timeout_msec, "Large projects may need a longer timeout_ms.")
		await Engine.get_main_loop().process_frame
	await _let_editor_apply_scan()
	EditorInterface.get_script_editor().reload_open_files()
	return {"duration_ms": Time.get_ticks_msec() - started_msec}


func _let_editor_apply_scan() -> void:
	await Engine.get_main_loop().process_frame
