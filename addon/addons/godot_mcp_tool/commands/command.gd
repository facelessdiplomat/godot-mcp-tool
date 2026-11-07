extends RefCounted

const GodotMcpCommandError := preload("command_error.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")


func execute(_params: Dictionary) -> Variant:
	return GodotMcpCommandError.new(GodotMcpJsonRpc.INTERNAL_ERROR, "%s does not implement execute()" % get_script().resource_path)
