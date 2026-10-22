extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")
const Params := preload("../commands/params.gd")

const DEFAULT_MAX_SIZE := 1280
const MINIMUM_MAX_SIZE := 256
const MAXIMUM_MAX_SIZE := 2560
const DEFAULT_FORMAT := "png"
const FORMATS := ["png", "jpeg"]


static func read(params: Dictionary) -> Variant:
	var max_size: Variant = Params.whole_number(params, "max_size", DEFAULT_MAX_SIZE)
	var format: Variant = Params.text(params, "format", DEFAULT_FORMAT)
	for value in [max_size, format]:
		if value is CommandError:
			return value
	if max_size < MINIMUM_MAX_SIZE or max_size > MAXIMUM_MAX_SIZE:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"max_size\" must be from %d to %d pixels" % [MINIMUM_MAX_SIZE, MAXIMUM_MAX_SIZE])
	if not format in FORMATS:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"format\" must be png or jpeg, not \"%s\"" % format)
	var views: Variant = params.get("views", [])
	if views == null:
		views = []
	if not views is Array:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"views\" must be a list", "Example: {\"views\": [\"front\", \"iso\"]}")
	return {"max_size": max_size, "format": format, "views": views}
