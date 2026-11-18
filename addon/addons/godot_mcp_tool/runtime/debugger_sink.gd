extends RefCounted

const GodotMcpReadyMessage := preload("ready_message.gd")
const GodotMcpRuntimeProtocol := preload("runtime_protocol.gd")


func send_entries(entries: Array) -> void:
	EngineDebugger.send_message(GodotMcpRuntimeProtocol.LOG_MESSAGE, [entries])


func send_ready(scene_path: String, windowless: bool, window_size: Vector2i) -> void:
	EngineDebugger.send_message(GodotMcpRuntimeProtocol.READY_MESSAGE, [GodotMcpReadyMessage.build(scene_path, windowless, window_size)])


func close() -> void:
	pass
