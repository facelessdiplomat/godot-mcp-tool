extends RefCounted

const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")

const ROOT := "user://"
const SCHEME_SEPARATOR := "://"
const PATH_EXAMPLE := "Paths are inside the folder of the game's user data, such as user://save.json or user://saves."


static func normalized(path: String) -> Variant:
	var full := path if path.contains(SCHEME_SEPARATOR) else ROOT + path.trim_prefix("/")
	var inside := full.trim_prefix(ROOT)
	if not full.begins_with(ROOT) or ".." in inside.split("/"):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" is not in the folder of the game's user data" % path, PATH_EXAMPLE)
	return ROOT + inside.trim_suffix("/")
