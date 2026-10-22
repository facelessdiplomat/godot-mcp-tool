extends "../command.gd"

const Params := preload("../params.gd")
const RuntimeContext := preload("../../runtime/runtime_context.gd")

const DEFAULT_LIMIT := 100
const MAXIMUM_LIMIT := 500
const LEVELS := ["error", "warning", "info"]

var _runtime: RuntimeContext


func _init(runtime: RuntimeContext) -> void:
	_runtime = runtime


func execute(params: Dictionary) -> Variant:
	var after: Variant = Params.whole_number(params, "after", -1)
	var levels: Variant = Params.text_list(params, "levels")
	var limit: Variant = Params.whole_number(params, "limit", DEFAULT_LIMIT)
	for value in [after, levels, limit]:
		if value is CommandError:
			return value
	for level in levels:
		if not level in LEVELS:
			return CommandError.new(JsonRpc.INVALID_PARAMS, "Unknown level \"%s\"" % level, "Levels are %s." % ", ".join(LEVELS))
	var run_start_cursor := _runtime.game.first_seq - 1
	var cursor: int = run_start_cursor if after > _runtime.log_store.last_seq else maxi(after, run_start_cursor)
	var page := _runtime.log_store.entries_after(cursor, PackedStringArray(levels), clampi(limit, 1, MAXIMUM_LIMIT))
	page["state"] = _runtime.game.state
	return page
