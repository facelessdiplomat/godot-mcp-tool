extends RefCounted

const GodotMcpCaptureStore := preload("capture_store.gd")
const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpImageFitter := preload("image_fitter.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")


static func write(image: Image, options: Dictionary, store: GodotMcpCaptureStore, prefix: String) -> Variant:
	if image == null or image.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "The renderer returned an empty image", "Try again; if it keeps failing, read the errors with game_get_output.")
	var fitted := GodotMcpImageFitter.fit(image, options["max_size"])
	var saved: Variant = store.save(fitted, prefix, options["format"])
	if saved is int:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not save the screenshot in %s: %s" % [store.directory, error_string(saved)])
	return {
		"path": ProjectSettings.globalize_path(saved),
		"width": fitted.get_width(),
		"height": fitted.get_height(),
		"original_width": image.get_width(),
		"original_height": image.get_height(),
	}
