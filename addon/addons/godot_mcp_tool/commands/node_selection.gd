extends RefCounted

const GodotMcpCommandError := preload("command_error.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")
const GodotMcpParams := preload("params.gd")

const MAXIMUM_PATHS := 20


static func read(params: Dictionary, example: String) -> Variant:
	var has_path := params.get("path") != null
	var has_paths := params.get("paths") != null
	if has_path and has_paths:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Give either \"path\" or \"paths\", not both", "Pass path for one node, or paths for up to %d nodes." % MAXIMUM_PATHS)
	if not has_paths:
		return GodotMcpParams.required_text(params, "path", example)
	var paths: Variant = GodotMcpParams.text_list(params, "paths")
	if paths is GodotMcpCommandError:
		return paths
	if (paths as Array).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"paths\" needs at least one node path")
	if (paths as Array).size() > MAXIMUM_PATHS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"paths\" takes at most %d node paths" % MAXIMUM_PATHS, "Read the rest in another call.")
	return paths


static func entry_of(node_path: String, outcome: Variant) -> Dictionary:
	if not outcome is GodotMcpCommandError:
		return outcome
	var failure := outcome as GodotMcpCommandError
	var entry := {"path": node_path, "error": failure.message}
	if not failure.hint.is_empty():
		entry["hint"] = failure.hint
	return entry
