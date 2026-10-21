extends RefCounted

const VERSION := "2.0"
const PARSE_ERROR := -32700
const INVALID_REQUEST := -32600
const METHOD_NOT_FOUND := -32601
const INVALID_PARAMS := -32602
const INTERNAL_ERROR := -32603
const UNAUTHORIZED := -32001
const PROTOCOL_MISMATCH := -32002


static func success(request_id: Variant, result: Variant) -> Dictionary:
	return {"jsonrpc": VERSION, "id": request_id, "result": result}


static func failure(request_id: Variant, code: int, message: String, hint: String = "") -> Dictionary:
	var error := {"code": code, "message": message}
	if not hint.is_empty():
		error["data"] = {"hint": hint}
	return {"jsonrpc": VERSION, "id": request_id, "error": error}


static func make_notification(method: String, params: Dictionary) -> Dictionary:
	return {"jsonrpc": VERSION, "method": method, "params": params}


static func encode(message: Dictionary) -> PackedByteArray:
	return (JSON.stringify(message) + "\n").to_utf8_buffer()
