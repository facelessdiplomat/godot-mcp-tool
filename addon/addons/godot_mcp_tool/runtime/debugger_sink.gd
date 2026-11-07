extends RefCounted

const GodotMcpRuntimeProtocol := preload("runtime_protocol.gd")


func send_entries(entries: Array) -> void:
	EngineDebugger.send_message(GodotMcpRuntimeProtocol.LOG_MESSAGE, [entries])


func send_ready(scene_path: String) -> void:
	EngineDebugger.send_message(GodotMcpRuntimeProtocol.READY_MESSAGE, [{"scene": scene_path}])


func close() -> void:
	pass
