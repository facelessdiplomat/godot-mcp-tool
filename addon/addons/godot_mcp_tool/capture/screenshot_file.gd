extends RefCounted

const GodotMcpCaptureStore := preload("capture_store.gd")
const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpImageComparison := preload("image_comparison.gd")
const GodotMcpImageFitter := preload("image_fitter.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")


static func write(image: Image, options: Dictionary, store: GodotMcpCaptureStore, prefix: String) -> Variant:
	if image == null or image.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "The renderer returned an empty image", "Try again; if it keeps failing, read the errors with game_get_output.")
	var fitted := GodotMcpImageFitter.fit(image, options["max_size"])
	var comparison := {}
	var earlier_reference := str(options.get("compare_to", ""))
	if not earlier_reference.is_empty():
		var earlier: Variant = GodotMcpImageComparison.load_earlier(earlier_reference)
		if earlier is String:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"compare_to\": %s" % earlier)
		comparison = GodotMcpImageComparison.compare(fitted, earlier, float(options.get("tolerance", 0.1)))
		comparison["earlier"] = earlier_reference
		if comparison["changed_rect"] != null:
			GodotMcpImageComparison.outline(fitted, comparison["changed_rect"])
	var saved: Variant = store.save(fitted, prefix, options["format"])
	if saved is int:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not save the screenshot in %s: %s" % [store.directory, error_string(saved)])
	var result := {
		"path": ProjectSettings.globalize_path(saved),
		"width": fitted.get_width(),
		"height": fitted.get_height(),
		"original_width": image.get_width(),
		"original_height": image.get_height(),
	}
	if not comparison.is_empty():
		result["comparison"] = comparison
	return result
