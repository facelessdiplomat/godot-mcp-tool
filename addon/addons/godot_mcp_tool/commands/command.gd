extends RefCounted

const CommandError := preload("command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")


func execute(_params: Dictionary) -> Variant:
	return CommandError.new(JsonRpc.INTERNAL_ERROR, "%s does not implement execute()" % get_script().resource_path)
